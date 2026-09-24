/*
 * 図面PDFビューア：表示・縮尺設定・面積/長さの計測・図面文字からの自動読取り
 *   - PDFは pdf.js（cdnjs）で描画。ワーカーはメインスレッド版を使う（file:// でも動くように）
 *   - 計測点は PDF の pt 座標で保持するので、拡大率を変えても結果は変わらない
 *   - 縮尺は「用紙が原寸のPDF（CAD出力）＋図面縮尺」か「2点を指定して実寸を入力（校正）」
 */
(function (global) {
  'use strict';

  var PT_MM = 25.4 / 72;
  var CMAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/';   // 日本語フォント(CID)の文字コード表           // 1pt = 0.3528mm
  var COLORS = ['#24478A', '#A93A25', '#1F6B4B', '#8A5F00', '#6B3FA0', '#0E7C86', '#9C2F6B'];

  var S = {
    pdf: null, fileName: '', page: 1, pages: 0, zoom: 1, fit: true,
    denom: 100, calib: null,       // calib = mm per pt（2点校正時）
    tool: 'none', draft: [], meas: [], seq: 1,
    detect: null, busy: false, calibPending: null, textPages: []
  };
  var ui = null;                    // マウント先の要素参照
  var opts = null;

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c == null) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function fmt(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function mmPerPt() { return S.calib || PT_MM * S.denom; }
  function hasLib() { return typeof pdfjsLib !== 'undefined'; }

  // ------------------------------------------------------------------ 計測値
  function polyLenPt(pts, closed) {
    var t = 0;
    for (var i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (closed && pts.length > 2) t += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return t;
  }
  function polyAreaPt(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) { var j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
    return Math.abs(a) / 2;
  }
  function measValue(m) {
    var k = mmPerPt();
    if (m.kind === 'area') return polyAreaPt(m.pts) * k * k / 1e6;   // ㎡
    return polyLenPt(m.pts, false) * k / 1000;                       // m
  }

  // ------------------------------------------------------------------ 読込
  function loadFile(file) {
    if (!hasLib()) { toast('PDF表示ライブラリを読み込めませんでした（ネット接続を確認してください）'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      S.busy = true; render();
      pdfjsLib.getDocument({ data: new Uint8Array(fr.result), cMapUrl: CMAP_URL, cMapPacked: true }).promise.then(function (pdf) {
        S.pdf = pdf; S.fileName = file.name; S.pages = pdf.numPages; S.page = 1; S.meas = []; S.draft = []; S.calib = null; S.fit = true;
        S.busy = false;
        return scanText(pdf);
      }).then(function () { render(); }).catch(function (e) {
        S.busy = false; render(); toast('PDFを開けませんでした：' + (e && e.message ? e.message : e));
      });
    };
    fr.readAsArrayBuffer(file);
  }

  // 図面の文字情報から、サッシの寸法コード・面積・縮尺を拾う
  function scanText(pdf) {
    var codes = opts.sashCodes ? opts.sashCodes() : {};
    var found = {}, areas = [], scale = null, jobs = [];
    S.textPages = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      jobs.push(pdf.getPage(i).then(function (pg) {
        return pg.getTextContent().then(function (tc) {
          var str = tc.items.map(function (it) { return it.str; }).join(' ').replace(/\s+/g, ' ');
          S.textPages[pg.pageNumber - 1] = str;
          var z = str.replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
          (z.match(/\d{5,6}/g) || []).forEach(function (c) {
            if (codes[c]) found[c] = (found[c] || 0) + 1;
          });
          var m = z.match(/(?:S|縮尺)\s*[=＝:：]?\s*1\s*[\/:：]\s*(\d{2,3})/);
          if (m && !scale) scale = +m[1];
          var rx = /(建築面積|1\s*階\s*床面積|1\s*F\s*床面積|1\s*階|2\s*階\s*床面積|2\s*F\s*床面積|2\s*階|延\s*べ?\s*床\s*面積|施工面積|ポーチ|吹\s*抜け?)[^0-9]{0,14}(\d{1,4}(?:\.\d{1,3})?)\s*(?:㎡|m2|m²|平方メートル)/g, r;
          while ((r = rx.exec(z))) areas.push({ label: r[1].replace(/\s/g, ''), value: +r[2], page: pg.pageNumber });
        });
      }));
    }
    return Promise.all(jobs).then(function () {
      if (scale) S.denom = scale;
      S.detect = { codes: found, areas: dedupeAreas(areas), scale: scale };
    });
  }
  function dedupeAreas(list) {
    var seen = {}, out = [];
    list.forEach(function (a) { var k = a.label + a.value; if (!seen[k]) { seen[k] = 1; out.push(a); } });
    return out.slice(0, 24);
  }
  function areaTarget(label) {
    if (/建築面積/.test(label)) return 'kenchiku';
    if (/^1(階|F)/.test(label)) return 'f1';
    if (/^2(階|F)/.test(label)) return 'f2';
    if (/ポーチ/.test(label)) return 'porch';
    if (/吹/.test(label)) return 'fuki1';
    return null;
  }

  // ------------------------------------------------------------------ 描画
  var renderTask = null;
  function drawPage() {
    if (!S.pdf || !ui || !ui.stage) return;
    S.pdf.getPage(S.page).then(function (pg) {
      var base = pg.getViewport({ scale: 1 });
      if (S.fit) {
        var w = ui.view.clientWidth - 4;
        S.zoom = Math.max(0.2, Math.min(4, w / base.width));
        S.fit = false;
      }
      var vp = pg.getViewport({ scale: S.zoom });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cv = ui.canvas, ov = ui.overlay;
      cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr);
      cv.style.width = vp.width + 'px'; cv.style.height = vp.height + 'px';
      ov.width = cv.width; ov.height = cv.height; ov.style.width = cv.style.width; ov.style.height = cv.style.height;
      if (renderTask) try { renderTask.cancel(); } catch (e) { /* noop */ }
      renderTask = pg.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      renderTask.promise.then(drawOverlay, function () { /* cancelled */ });
      S.pageSizePt = [base.width, base.height];
      if (ui.paperInfo) ui.paperInfo.textContent = paperName(base.width, base.height);
    });
  }
  function paperName(w, h) {
    var a = Math.max(w, h), b = Math.min(w, h), mm = function (x) { return Math.round(x * PT_MM); };
    var sizes = [['A1', 841, 594], ['A2', 594, 420], ['A3', 420, 297], ['A4', 297, 210]];
    for (var i = 0; i < sizes.length; i++) if (Math.abs(mm(a) - sizes[i][1]) < 6 && Math.abs(mm(b) - sizes[i][2]) < 6) return '用紙 ' + sizes[i][0] + '（' + mm(a) + '×' + mm(b) + 'mm）';
    return '用紙 ' + mm(a) + '×' + mm(b) + 'mm';
  }
  function toCanvas(p) { var dpr = ui.overlay.width / parseFloat(ui.overlay.style.width); return [p[0] * S.zoom * dpr, p[1] * S.zoom * dpr]; }
  function drawOverlay() {
    if (!ui || !ui.overlay) return;
    var ctx = ui.overlay.getContext('2d'), dpr = ui.overlay.width / parseFloat(ui.overlay.style.width || 1);
    ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
    ctx.lineWidth = 2 * dpr; ctx.font = (12 * dpr) + 'px sans-serif';
    S.meas.forEach(function (m, idx) {
      if (m.page !== S.page) return;
      var col = COLORS[idx % COLORS.length];
      path(ctx, m.pts, m.kind === 'area');
      ctx.strokeStyle = col; ctx.stroke();
      if (m.kind === 'area') { ctx.fillStyle = col + '22'; ctx.fill(); }
      var c = centroid(m.pts), cp = toCanvas(c);
      var label = '#' + m.id + ' ' + (m.kind === 'area' ? fmt(measValue(m), 2) + '㎡' : fmt(measValue(m), 2) + 'm');
      ctx.fillStyle = '#FFFFFF'; var tw = ctx.measureText(label).width;
      ctx.fillRect(cp[0] - 4 * dpr, cp[1] - 14 * dpr, tw + 8 * dpr, 18 * dpr);
      ctx.fillStyle = col; ctx.fillText(label, cp[0], cp[1]);
    });
    if (S.draft.length) {
      path(ctx, S.draft, false);
      ctx.strokeStyle = '#A93A25'; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.stroke(); ctx.setLineDash([]);
      S.draft.forEach(function (p) { var q = toCanvas(p); ctx.fillStyle = '#A93A25'; ctx.beginPath(); ctx.arc(q[0], q[1], 4 * dpr, 0, Math.PI * 2); ctx.fill(); });
    }
  }
  function path(ctx, pts, closed) {
    ctx.beginPath();
    pts.forEach(function (p, i) { var q = toCanvas(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    if (closed) ctx.closePath();
  }
  function centroid(pts) {
    var x = 0, y = 0; pts.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / pts.length, y / pts.length];
  }

  // ------------------------------------------------------------------ 操作
  var down = null;
  function onDown(e) { down = { x: e.clientX, y: e.clientY }; }
  function onUp(e) {
    if (!down || S.tool === 'none') { down = null; return; }
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 6) return;                     // スクロール操作は無視
    var r = ui.overlay.getBoundingClientRect();
    var pt = [(e.clientX - r.left) / S.zoom, (e.clientY - r.top) / S.zoom];
    S.draft.push(pt);
    if (S.tool === 'calib' && S.draft.length === 2) { S.calibPending = S.draft.slice(); S.draft = []; render(); return; }
    drawOverlay(); renderDraftInfo();
  }
  function finish() {
    if (S.tool === 'area' && S.draft.length >= 3) addMeas('area');
    else if (S.tool === 'len' && S.draft.length >= 2) addMeas('len');
    S.draft = []; render();
  }
  function addMeas(kind) {
    var m = { id: S.seq++, kind: kind, page: S.page, pts: S.draft.slice(), target: kind === 'area' ? 'f1' : 'kiso', label: '' };
    S.meas.push(m);
  }
  function setTool(t) { S.tool = S.tool === t ? 'none' : t; S.draft = []; render(); }

  // ------------------------------------------------------------------ UI
  function renderDraftInfo() {
    if (!ui || !ui.draftInfo) return;
    var txt = '';
    if (S.tool === 'area') txt = S.draft.length + '点 ' + (S.draft.length >= 3 ? '→ ' + fmt(polyAreaPt(S.draft) * mmPerPt() * mmPerPt() / 1e6, 2) + '㎡' : '（3点以上で面積）');
    if (S.tool === 'len') txt = S.draft.length + '点 ' + (S.draft.length >= 2 ? '→ ' + fmt(polyLenPt(S.draft) * mmPerPt() / 1000, 2) + 'm' : '');
    if (S.tool === 'calib') txt = '基準にする寸法線の両端を2点クリック（' + S.draft.length + '/2）';
    ui.draftInfo.textContent = txt;
  }

  function targetTotals() {
    var t = {};
    S.meas.forEach(function (m) { if (!m.target) return; t[m.target] = (t[m.target] || 0) + measValue(m); });
    return t;
  }

  function render() {
    if (!ui || !ui.root) return;
    var root = ui.root; root.innerHTML = '';
    var T = opts.targets;
    function tlabel(key) { for (var i = 0; i < T.length; i++) if (T[i].key === key) return T[i].label; return key; }

    // ---- ツールバー
    var file = h('input', { type: 'file', id: 'planFile', accept: 'application/pdf,.pdf', onchange: function (e) { if (e.target.files[0]) loadFile(e.target.files[0]); } });
    var bar = h('div', { class: 'plan-toolbar' }, [
      h('label', { class: 'btn primary file-btn', for: 'planFile' }, ['図面PDFを開く', file]),
      S.pdf ? h('span', { class: 'muted', text: S.fileName + '（' + S.pages + 'ページ）' }) : null
    ]);
    root.appendChild(bar);

    if (S.pdf) {
      var nav = h('div', { class: 'plan-toolbar' }, [
        h('button', { type: 'button', class: 'btn small', disabled: S.page <= 1 || null, onclick: function () { S.page--; S.draft = []; render(); } }, ['◀ 前']),
        h('span', { class: 'num', text: S.page + ' / ' + S.pages }),
        h('button', { type: 'button', class: 'btn small', disabled: S.page >= S.pages || null, onclick: function () { S.page++; S.draft = []; render(); } }, ['次 ▶']),
        h('span', { class: 'muted', text: '｜' }),
        h('button', { type: 'button', class: 'btn small', onclick: function () { S.zoom = Math.max(0.2, S.zoom / 1.25); drawPage(); } }, ['－']),
        h('span', { class: 'num', text: Math.round(S.zoom * 100) + '%' }),
        h('button', { type: 'button', class: 'btn small', onclick: function () { S.zoom = Math.min(6, S.zoom * 1.25); drawPage(); } }, ['＋']),
        h('button', { type: 'button', class: 'btn small', onclick: function () { S.fit = true; drawPage(); } }, ['幅に合わせる'])
      ]);
      root.appendChild(nav);

      var scaleSel = h('select', { class: 'inp', id: 'planScale', style: 'width:auto', onchange: function (e) { S.denom = +e.target.value; S.calib = null; render(); } },
        [30, 50, 100, 150, 200, 300].map(function (d) { return h('option', { value: d, selected: (!S.calib && S.denom === d) || null, text: '1/' + d }); }));
      ui.paperInfo = h('span', { class: 'muted' });
      var scaleRow = h('div', { class: 'plan-toolbar' }, [
        h('span', { text: '縮尺' }), scaleSel,
        h('button', { type: 'button', class: 'chip', 'aria-pressed': S.tool === 'calib' ? 'true' : 'false', onclick: function () { setTool('calib'); } }, ['2点で校正']),
        S.calib ? h('span', { class: 'pill minus', text: '校正済み（' + fmt(S.calib, 2) + 'mm/pt）' }) : null,
        ui.paperInfo,
        S.detect && S.detect.scale ? h('span', { class: 'pill', text: '図面の表記から 1/' + S.detect.scale + ' を設定' }) : null
      ]);
      root.appendChild(scaleRow);

      var tools = h('div', { class: 'plan-toolbar' }, [
        h('button', { type: 'button', class: 'chip', 'aria-pressed': S.tool === 'area' ? 'true' : 'false', onclick: function () { setTool('area'); } }, ['面積を測る']),
        h('button', { type: 'button', class: 'chip', 'aria-pressed': S.tool === 'len' ? 'true' : 'false', onclick: function () { setTool('len'); } }, ['長さを測る']),
        (S.tool === 'area' || S.tool === 'len') ? h('button', { type: 'button', class: 'btn small primary', onclick: finish }, ['確定']) : null,
        S.draft.length ? h('button', { type: 'button', class: 'btn small', onclick: function () { S.draft.pop(); drawOverlay(); renderDraftInfo(); } }, ['1点戻す']) : null,
        (ui.draftInfo = h('span', { class: 'muted' }))
      ]);
      root.appendChild(tools);

      if (S.calibPending) {
        var inp = h('input', { class: 'inp num', id: 'calibMm', type: 'number', inputmode: 'decimal', placeholder: '例 9100', style: 'width:120px' });
        root.appendChild(h('div', { class: 'callout' }, [
          h('div', { class: 'plan-toolbar' }, [
            h('span', { text: '2点間の実寸' }), inp, h('span', { text: 'mm' }),
            h('button', { type: 'button', class: 'btn small primary', onclick: function () {
              var mm = +inp.value; if (!(mm > 0)) { toast('実寸をmmで入力してください'); return; }
              S.calib = mm / polyLenPt(S.calibPending); S.calibPending = null; S.tool = 'none'; render(); toast('縮尺を校正しました');
            } }, ['この寸法で校正']),
            h('button', { type: 'button', class: 'btn small', onclick: function () { S.calibPending = null; render(); } }, ['やめる'])
          ])
        ]));
      }
    }

    // ---- 図面表示
    var view = h('div', { class: 'plan-view' });
    if (S.pdf) {
      var stage = h('div', { class: 'plan-stage' });
      var cv = h('canvas'), ov = h('canvas', { class: 'overlay', 'aria-label': '計測レイヤー' });
      ov.addEventListener('pointerdown', onDown);
      ov.addEventListener('pointerup', onUp);
      ov.addEventListener('dblclick', function (e) { e.preventDefault(); if (S.draft.length > 0) { S.draft.pop(); finish(); } });
      stage.appendChild(cv); stage.appendChild(ov); view.appendChild(stage);
      ui.canvas = cv; ui.overlay = ov; ui.stage = stage;
    } else {
      view.appendChild(h('div', { class: 'plan-empty' }, [
        h('div', {}, [
          h('p', { text: S.busy ? 'PDFを読み込んでいます…' : '平面図・立面図・求積図のPDFを開くと、ここに表示されます。' }),
          h('p', { class: 'note', text: 'CADから出力したPDFなら、図面の縮尺（1/100など）を選ぶだけで面積・長さを測れます。スキャンPDFは「2点で校正」で寸法線から縮尺を合わせてください。' })
        ])
      ]));
      ui.canvas = ui.overlay = ui.stage = null;
    }
    ui.view = view;
    root.appendChild(view);

    // ---- 自動読取り
    if (S.detect) {
      var det = h('div', { class: 'card stack' }, [h('h2', {}, ['図面の文字から読み取った候補', h('span', { class: 'sub', text: '確認してから反映してください' })])]);
      var codes = Object.keys(S.detect.codes);
      if (codes.length) {
        det.appendChild(h('div', { class: 'stack' }, [
          h('span', { class: 'lbl muted', text: 'サッシ寸法コード（タップでサッシ画面へ）' }),
          h('div', { class: 'cand' }, codes.sort().map(function (c) {
            return h('button', { type: 'button', class: 'chip', onclick: function () { opts.onSashCode && opts.onSashCode(c); } }, [h('span', { class: 'code', text: c }), h('span', { class: 'badge', text: '×' + S.detect.codes[c] })]);
          }))
        ]));
      }
      if (S.detect.areas.length) {
        det.appendChild(h('div', { class: 'stack' }, [
          h('span', { class: 'lbl muted', text: '面積の表記' }),
          h('div', { class: 'cand' }, S.detect.areas.map(function (a) {
            var tk = areaTarget(a.label);
            return h('button', { type: 'button', class: 'chip', disabled: !tk || null, title: tk ? tlabel(tk) + 'に反映' : '反映先なし（参考）', onclick: function () { if (tk) opts.onApply(tk, a.value); } },
              [a.label + ' ' + fmt(a.value, 2) + '㎡', tk ? h('span', { class: 'badge', text: '→' + tlabel(tk) }) : null]);
          }))
        ]));
      }
      if (!codes.length && !S.detect.areas.length) det.appendChild(h('p', { class: 'note', text: 'このPDFからは文字情報を読み取れませんでした（画像のみのPDFの可能性があります）。計測ツールで面積・長さを測ってください。' }));
      root.appendChild(det);
    }

    // ---- 計測結果
    if (S.meas.length) {
      var list = h('div', { class: 'meas-list' });
      S.meas.forEach(function (m, idx) {
        var sel = h('select', { class: 'inp', style: 'min-height:32px', onchange: function (e) { m.target = e.target.value; render(); } },
          [h('option', { value: '', text: '（反映しない）' })].concat(T.filter(function (t) { return t.kind === m.kind; }).map(function (t) {
            return h('option', { value: t.key, selected: m.target === t.key || null, text: t.label });
          })));
        list.appendChild(h('div', { class: 'meas' }, [
          h('span', { class: 'sw', style: 'background:' + COLORS[idx % COLORS.length] }),
          h('span', {}, ['#' + m.id + ' ' + (m.kind === 'area' ? '面積 ' : '長さ ') + fmt(measValue(m), 2) + (m.kind === 'area' ? '㎡' : 'm') + '（p' + m.page + '）']),
          sel,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': '削除', onclick: function () { S.meas.splice(idx, 1); render(); } }, ['×'])
        ]));
      });
      var totals = targetTotals();
      var apply = h('div', { class: 'cand' }, Object.keys(totals).map(function (k) {
        var t = T.filter(function (x) { return x.key === k; })[0];
        return h('button', { type: 'button', class: 'btn small primary', onclick: function () { opts.onApply(k, Math.round(totals[k] * 100) / 100); } },
          [(t ? t.label : k) + ' ＝ ' + fmt(totals[k], 2) + (t && t.kind === 'area' ? '㎡' : 'm') + ' を反映']);
      }));
      root.appendChild(h('div', { class: 'card stack' }, [h('h2', {}, ['計測結果', h('span', { class: 'sub', text: '同じ反映先の計測は合計されます' })]), list, apply]));
    }

    renderDraftInfo();
    if (S.pdf) requestAnimationFrame(drawPage);
  }

  function toast(msg) { if (opts && opts.toast) opts.toast(msg); }

  global.Plan = {
    mount: function (root, o) { opts = o; ui = { root: root }; render(); },
    hasPdf: function () { return !!S.pdf; },
    detected: function () { return S.detect; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
