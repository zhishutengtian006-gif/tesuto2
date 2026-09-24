/*
 * 住宅見積ナビ — 画面
 *   状態(P) → Engine.evaluate(P) → 結果(R) を画面に描く。
 *   入力のたびに R を再計算し、金額表示（live）だけを差し替える。行の追加・削除などはタブを描き直す。
 */
(function () {
  'use strict';
  if (!window.Engine) {
    document.getElementById('main').innerHTML = '<section class="card"><h2>単価マスタがありません</h2><p class="note">見積Excel（.xlsm）から単価マスタを作成してください：<br><code class="code">pip install openpyxl</code><br><code class="code">python3 tools/extract_master.py 見積書.xlsm</code><br>js/master-data.js が作られたら、このページを再読み込みしてください。</p></section>';
    return;
  }
  var E = window.Engine, D = E.D, n = E.n;
  var STORE_KEY = 'mitsumori.draft.v1', TAB_KEY = 'mitsumori.tab', INTERNAL_KEY = 'mitsumori.internal';
  var uid = 1;
  var IN_FRAME = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // ------------------------------------------------------------------ 保存（この端末の下書き）
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function loadDraft() {
    try { var s = store(STORE_KEY); if (!s) return null; return migrate(JSON.parse(s)); } catch (e) { return null; }
  }
  function migrate(p) {
    var base = E.newProject();
    (function merge(dst, src) {
      for (var k in src) {
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], src[k]);
        else dst[k] = src[k];
      }
    })(base, p || {});
    return base;
  }
  var P = loadDraft() || sampleProject();
  var R = E.evaluate(P);
  var tab = store(TAB_KEY) || 'basic';
  var showInternal = store(INTERNAL_KEY) === '1';
  var ui = { sashCat: null, sashSearch: '', doorGroup: null, doorType: null, zosakuSym: 'A', shelfKind: null, kadouLabel: null, detailTag: 'all', detailOnlyQty: true, detailSearch: '' };

  // ------------------------------------------------------------------ 小道具
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function yen(x) { x = Math.round(x || 0); return (x < 0 ? '−' : '') + '¥' + Math.abs(x).toLocaleString('ja-JP'); }
  function signedYen(x) { x = Math.round(x || 0); return (x > 0 ? '+' : x < 0 ? '−' : '±') + '¥' + Math.abs(x).toLocaleString('ja-JP'); }
  function num(x, d) { d = d || 0; return (+x || 0).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function cls(x) { return x > 0 ? 'plus' : x < 0 ? 'minus' : ''; }
  function newId() { return 'L' + Date.now().toString(36) + (uid++); }

  var LIVE = [];
  function live(fn, className, tag) {
    var el = h(tag || 'span', { class: className });
    LIVE.push([el, fn]);
    try { el.textContent = fn(R); } catch (e) { el.textContent = '—'; }
    return el;
  }
  function liveCls(el, fn) { LIVE.push([el, function (r) { el.classList.remove('plus', 'minus'); var c = fn(r); if (c) el.classList.add(c); return null; }]); return el; }

  function recompute() {
    R = E.evaluate(P);
    LIVE.forEach(function (x) { try { var t = x[1](R); if (t !== null) x[0].textContent = t; } catch (e) { x[0].textContent = '—'; } });
    renderSummary(); renderSteps(); saveSoon();
  }
  function commit() { R = E.evaluate(P); renderMain(); renderSummary(); renderSteps(); saveSoon(); }
  var saveT = null;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(function () { store(STORE_KEY, JSON.stringify(P)); }, 300); }

  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // パス（'area.f1' 等）で状態を読み書き
  function getPath(path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, P); }
  function setPath(path, val) {
    var ks = path.split('.'), o = P;
    for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = val;
  }

  // ------------------------------------------------------------------ 入力部品
  function inputNum(path, attrs) {
    attrs = attrs || {};
    var id = attrs.id || ('f_' + path.replace(/\./g, '_'));
    var v = getPath(path);
    var el = h('input', { class: 'inp num' + (attrs.tiny ? ' tiny' : ''), id: id, type: 'text', inputmode: 'decimal', value: v == null ? '' : v, placeholder: attrs.placeholder || '' });
    el.addEventListener('input', function () {
      var raw = el.value.replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/,/g, '');
      setPath(path, raw === '' ? '' : (isNaN(+raw) ? raw : +raw));
      if (attrs.rerender) commit(); else recompute();
    });
    return el;
  }
  function numField(label, path, unit, opt) {
    opt = opt || {};
    var inp = inputNum(path, opt);
    var kids = [h('span', { class: 'lbl', text: label }), h('div', { class: 'unit-wrap' }, [inp, unit ? h('span', { class: 'u', text: unit }) : null])];
    if (opt.tsubo) kids.push(live(function () { var v = n(getPath(path)); return v ? '＝ ' + num(E.tsubo(v), 2) + ' 坪' : ' '; }, 'conv'));
    if (opt.hint) kids.push(h('span', { class: 'hint', text: opt.hint }));
    return h('label', { class: 'field', for: inp.id }, kids);
  }
  function textField(label, path, opt) {
    opt = opt || {};
    var id = 'f_' + path.replace(/\./g, '_');
    var el = h('input', { class: 'inp', id: id, type: opt.type || 'text', value: getPath(path) || '', placeholder: opt.placeholder || '' });
    el.addEventListener('input', function () { setPath(path, el.value); if (opt.onchange) opt.onchange(); recompute(); });
    return h('label', { class: 'field', for: id }, [h('span', { class: 'lbl', text: label }), el]);
  }
  function seg(options, path, opt) {
    opt = opt || {};
    var cur = getPath(path);
    return h('div', { class: 'seg', role: 'group', 'aria-label': opt.label || '' }, options.map(function (o) {
      var val = typeof o === 'object' ? o.value : o, lab = typeof o === 'object' ? o.label : o;
      return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(cur) === String(val) ? 'true' : 'false', onclick: function () {
        setPath(path, val); if (opt.after) opt.after(val); commit();
      } }, [lab]);
    }));
  }
  function toggle(label, path, opt) {
    opt = opt || {};
    var id = 't_' + path.replace(/\./g, '_');
    var cb = h('input', { type: 'checkbox', id: id, checked: !!getPath(path) || null });
    cb.addEventListener('change', function () { setPath(path, cb.checked); if (opt.rerender) commit(); else recompute(); });
    return h('label', { class: 'toggle', for: id }, [cb, h('span', { text: label })]);
  }
  function stepper(get, set, opt) {
    opt = opt || {};
    var inp = h('input', { type: 'text', inputmode: 'numeric', value: get() || 0, 'aria-label': opt.label || '数量' });
    function apply(v) { set(v); inp.value = v; if (opt.rerender) commit(); else recompute(); }
    inp.addEventListener('input', function () { var v = +inp.value.replace(/[^\d.-]/g, ''); if (!isNaN(v)) { set(v); if (!opt.rerender) recompute(); } });
    inp.addEventListener('change', function () { if (opt.rerender) commit(); });
    return h('span', { class: 'stepper' }, [
      h('button', { type: 'button', 'aria-label': '減らす', onclick: function () { var v = n(get()) - 1; if (opt.min != null && v < opt.min) v = opt.min; apply(v); } }, ['−']),
      inp,
      h('button', { type: 'button', 'aria-label': '増やす', onclick: function () { apply(n(get()) + 1); } }, ['+'])
    ]);
  }
  function card(title, sub, kids, extraCls) {
    return h('section', { class: 'card ' + (extraCls || '') }, [h('h2', {}, [title, sub ? h('span', { class: 'sub', text: sub }) : null])].concat(kids));
  }
  function pageHead(title, desc, actions) {
    return h('div', { class: 'page-head' }, [h('div', {}, [h('h1', { text: title }), desc ? h('p', { text: desc }) : null]), actions ? h('div', { class: 'doc-actions' }, actions) : null]);
  }
  function diffbar(stdFn, selFn, diffFn, labels) {
    labels = labels || ['標準（本体価格に含む）', '選択した合計', '差額（オプション）'];
    var d = live(function (r) { return signedYen(diffFn(r)); }, '', 'strong');
    liveCls(d, function (r) { return cls(diffFn(r)); });
    return h('div', { class: 'diffbar' }, [
      h('div', {}, [h('span', { class: 'lbl', text: labels[0] }), live(function (r) { return yen(stdFn(r)); }, '', 'strong')]),
      h('div', {}, [h('span', { class: 'lbl', text: labels[1] }), live(function (r) { return yen(selFn(r)); }, '', 'strong')]),
      h('div', {}, [h('span', { class: 'lbl', text: labels[2] }), d])
    ]);
  }
  function rowSell(row) { var s = 0; R.lines.forEach(function (l) { if (l.row === row) s += l.sell; }); return s; }
  function rowsSell(rows) { return rows.reduce(function (t, r) { return t + rowSell(r); }, 0); }
  function rowsSellR(r, rows) { var s = 0; r.lines.forEach(function (l) { if (rows.indexOf(l.row) >= 0) s += l.sell; }); return s; }

  // ------------------------------------------------------------------ タブ定義
  var TABS = [
    { key: 'basic', label: '基本情報', render: renderBasic },
    { key: 'plan', label: '図面・面積', render: renderPlan, dot: function (r) { return r.v.sekouT ? num(r.v.sekouT, 2) + '坪' : ''; } },
    { key: 'sash', label: 'サッシ', render: renderSash, dot: function () { return P.sash.length ? P.sash.length + '件' : ''; } },
    { key: 'door', label: '建具', render: renderDoors, dot: function () { var c = P.doors.length + P.zosaku.length; return c ? c + '件' : ''; } },
    { key: 'storage', label: '収納', render: renderStorage, dot: function () { var c = P.shelves.length + P.kadou.lines.length; return c ? c + '件' : ''; } },
    { key: 'equip', label: '電気・設備', render: renderEquip },
    { key: 'option', label: '外部・内部OP', render: renderOptions },
    { key: 'futai', label: '付帯・申請', render: renderFutai },
    { key: 'estimate', label: '見積書', render: renderEstimate },
    { key: 'detail', label: '積算明細', render: renderDetail }
  ];
  function go(key) { tab = key; store(TAB_KEY, key); renderMain(); renderSteps(); window.scrollTo(0, 0); document.getElementById('main').focus({ preventScroll: true }); }

  function renderSteps() {
    var nav = document.getElementById('steps'); nav.innerHTML = '';
    TABS.forEach(function (t, i) {
      var dot = t.dot ? t.dot(R) : '';
      nav.appendChild(h('button', { type: 'button', class: 'step', 'aria-current': tab === t.key ? 'page' : null, onclick: function () { go(t.key); } },
        [h('span', { class: 'no', text: String(i + 1) }), h('span', { text: t.label }), dot ? h('span', { class: 'dot', text: dot }) : null]));
    });
    var active = nav.querySelector('[aria-current="page"]');
    if (active && nav.scrollWidth > nav.clientWidth) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function renderMain() {
    LIVE = [];
    var main = document.getElementById('main'); main.innerHTML = '';
    var t = TABS.filter(function (x) { return x.key === tab; })[0] || TABS[0];
    t.render(main);
    document.getElementById('projTitle').textContent = (P.info.client ? P.info.client + ' 様　' : '') + (P.info.name || '新規見積');
  }

  // ------------------------------------------------------------------ 1. 基本情報
  function renderBasic(main) {
    var rate = function (r) { return '原価率 ' + Math.round(r.v.genka * 1000) / 10 + '%（利益率 ' + Math.round((1 - r.v.genka) * 1000) / 10 + '%）'; };
    main.appendChild(pageHead('基本情報', 'お客様と建物の条件を選びます。仕様・区分を変えると、標準価格と原価率が切り替わります。'));
    main.appendChild(card('お客様・工事', null, [
      h('div', { class: 'grid g3' }, [
        textField('お施主様名', 'info.client', { placeholder: '例：山田 太郎' }),
        textField('工事名', 'info.name', { placeholder: '例：山田様邸 新築工事' }),
        textField('工事場所', 'info.site', { placeholder: '例：白山市○○町' }),
        h('label', { class: 'field', for: 'f_city' }, [h('span', { class: 'lbl', text: '申請先（長期優良の認定料）' }),
          (function () {
            var s = h('select', { class: 'inp', id: 'f_city' }, D.input.cities.map(function (c) { return h('option', { value: c.name, selected: P.info.city === c.name || null, text: c.name + (c.chokiFee ? '（' + num(c.chokiFee) + '円）' : '（要確認）') }); }));
            s.addEventListener('change', function () { P.info.city = s.value; recompute(); }); return s;
          })()]),
        textField('見積提出日', 'info.date', { type: 'date' }),
        textField('営業担当', 'info.staff')
      ])
    ]));
    main.appendChild(card('建物仕様', null, [
      h('div', { class: 'stack' }, [
        h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '仕様' }), seg([{ value: 'フジタ', label: 'フジタ仕様' }, { value: 'PG', label: 'PG HOUSE' }, { value: 'STO', label: 'STO（外断熱）' }], 'spec')]),
        h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '階数' }), seg(['平屋', '2階建'], 'floors')]),
        h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '耐震等級' }), seg([{ value: 1, label: '等級1' }, { value: 2, label: '等級2' }, { value: 3, label: '等級3（構造計算）' }], 'taishin')]),
        n(P.taishin) === 1 ? h('p', { class: 'callout warn', text: '耐震等級1では長期優良住宅の認定を受けられません。' }) : null
      ])
    ]));
    main.appendChild(card('見積区分・原価率', null, [
      h('div', { class: 'stack' }, [
        seg(['通常', '簡易', '紹介', '紹介簡易'], 'kubun'),
        live(rate, 'note'),
        h('div', { class: 'grid g3' }, [
          numField('原価率を手入力', 'genkaOverride', '%', { placeholder: '空欄＝区分どおり', hint: Object.keys(D.input.kubunRate).map(function (k) { return k + D.input.kubunRate[k]; }).join('／') }),
          numField('住設の原価率（特例）', 'setsubiOverride', '%', { placeholder: '空欄＝同じ' }),
          numField('積雪', 'snow', 'm')
        ])
      ])
    ]));
    main.appendChild(h('div', { class: 'card-row' }, [h('span', { class: 'note', text: '次は図面から面積を入れます。' }), h('button', { type: 'button', class: 'btn primary', onclick: function () { go('plan'); } }, ['図面・面積へ →'])]));
  }

  // ------------------------------------------------------------------ 2. 図面・面積
  var PLAN_TARGETS = [
    { key: 'kenchiku', path: 'area.kenchiku', label: '建築面積', kind: 'area' },
    { key: 'f1', path: 'area.f1', label: '1F床面積', kind: 'area' },
    { key: 'f1NoFloor', path: 'area.f1NoFloor', label: '1F うち床無し', kind: 'area' },
    { key: 'tatami', path: 'area.tatami', label: '畳部分', kind: 'area' },
    { key: 'f2', path: 'area.f2', label: '2F床面積', kind: 'area' },
    { key: 'f2NoFloor', path: 'area.f2NoFloor', label: '2F うち階段', kind: 'area' },
    { key: 'porch', path: 'area.porch', label: 'ポーチ等（延床外）', kind: 'area' },
    { key: 'fuki1', path: 'area.fuki1', label: '吹抜①', kind: 'area' },
    { key: 'fuki2', path: 'area.fuki2', label: '吹抜②', kind: 'area' },
    { key: 'gaiheki', path: 'q.gaiheki', label: '外壁面積', kind: 'area' },
    { key: 'roof1', path: 'q.roof1.area', label: '大屋根面積', kind: 'area' },
    { key: 'roof2', path: 'q.roof2.area', label: '下屋面積', kind: 'area' },
    { key: 'tile', path: 'q.tile', label: '玄関タイル', kind: 'area' },
    { key: 'kiso', path: 'len.kiso', label: '基礎外周', kind: 'len' },
    { key: 'shikichi', path: 'len.shikichi', label: '敷地外周', kind: 'len' },
    { key: 'nokiDe', path: 'q.nokiDe', label: '軒の出', kind: 'len' },
    { key: 'nokiSagari', path: 'q.nokiSagari', label: '軒の出＋下がり壁', kind: 'len' },
    { key: 'kasa1', path: 'len.kasa1', label: '目隠塀1F（笠木あり）', kind: 'len' },
    { key: 'nokasa1', path: 'len.nokasa1', label: '目隠塀1F（笠木なし）', kind: 'len' },
    { key: 'parapet', path: 'len.parapet', label: 'パラペット', kind: 'len' },
    { key: 'koshikabe', path: 'q.koshikabe', label: '手摺壁', kind: 'len' },
    { key: 'toiNoki', path: 'q.toi.noki', label: '軒樋', kind: 'len' },
    { key: 'habaki', path: 'q.habaki', label: '巾木 総延長', kind: 'len' }
  ];
  function renderPlan(main) {
    main.appendChild(pageHead('図面・面積', '求積図の数値を入れるか、図面PDFの上で囲って測ります。㎡を入れると坪（×0.3025、小数2桁切捨て）に換算します。'));
    var sums = h('div', { class: 'diffbar' }, [
      h('div', {}, [h('span', { class: 'lbl', text: '延床面積' }), live(function (r) { return num(r.v.nobe, 2) + '㎡ ／ ' + num(r.v.nobeT, 2) + '坪'; }, '', 'strong')]),
      h('div', {}, [h('span', { class: 'lbl', text: '施工面積（坪単価の基準）' }), live(function (r) { return num(r.v.sekou, 2) + '㎡ ／ ' + num(r.v.sekouT, 2) + '坪'; }, '', 'strong')]),
      h('div', {}, [h('span', { class: 'lbl', text: '下屋（割増対象）' }), live(function (r) { return num(r.v.geya, 2) + '㎡ ／ ' + num(r.v.geyaT, 2) + '坪'; }, '', 'strong')])
    ]);
    main.appendChild(sums);
    main.appendChild(card('床面積', '求積図より', [
      h('div', { class: 'grid g3' }, [
        numField('建築面積', 'area.kenchiku', '㎡', { tsubo: true }),
        numField('1F 床面積', 'area.f1', '㎡', { tsubo: true }),
        numField('1F うち床無し', 'area.f1NoFloor', '㎡', { tsubo: true, hint: '玄関土間・UB・車庫・外部収納など（延床に含む）' }),
        numField('1F うち畳部分', 'area.tatami', '㎡', { tsubo: true }),
        h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '和室の区分' }), seg([{ value: '', label: 'なし' }, '大壁', '真壁'], 'area.tatamiType')]),
        numField('2F 床面積', 'area.f2', '㎡', { tsubo: true }),
        numField('2F うち階段', 'area.f2NoFloor', '㎡', { tsubo: true, hint: '2Fフロア面積から除く' }),
        numField('ポーチ等（延床外）', 'area.porch', '㎡', { tsubo: true, hint: '施工面積には含む' }),
        numField('吹抜①', 'area.fuki1', '㎡', { tsubo: true, hint: '施工面積に含む' }),
        numField('吹抜②', 'area.fuki2', '㎡', { tsubo: true, hint: '施工面積に含まない' }),
        numField('断熱の除外面積', 'area.jogai', '㎡', { hint: 'インナーガレージなど断熱境界の外' })
      ])
    ]));
    main.appendChild(card('外周・外壁', null, [
      h('div', { class: 'grid g4' }, [
        numField('基礎外周', 'len.kiso', 'm'),
        numField('敷地外周', 'len.shikichi', 'm', { hint: 'ケアネットの既定数量' }),
        numField('外壁面積', 'q.gaiheki', '㎡', { hint: 'サイディング・下地・塗装に使用' }),
        numField('同質コーナー', 'q.corner', 'm')
      ])
    ]));
    var planBox = h('div', { class: 'plan-wrap' });
    main.appendChild(card('図面PDF', 'PDFを開いて面積・長さを計測／図面の文字から自動で読み取り', [planBox]));
    if (window.Plan) {
      Plan.mount(planBox, {
        targets: PLAN_TARGETS,
        toast: toast,
        sashCodes: sashCodeIndex,
        onApply: function (key, value) {
          var t = PLAN_TARGETS.filter(function (x) { return x.key === key; })[0]; if (!t) return;
          setPath(t.path, Math.round(value * 100) / 100); commit(); toast(t.label + ' に ' + num(value, 2) + (t.kind === 'area' ? '㎡' : 'm') + ' を入れました');
        },
        onSashCode: function (code) { ui.sashSearch = code; ui.sashCat = null; go('sash'); }
      });
    }
  }

  // ------------------------------------------------------------------ 3. サッシ
  var SASH_CATS = null;
  function sashCats() {
    if (SASH_CATS) return SASH_CATS;
    var m = {};
    D.sash.forEach(function (s) { if (s.cat === '標準') return; (m[s.cat] = m[s.cat] || []).push(s); });
    SASH_CATS = Object.keys(m).map(function (k) { return { name: k, items: m[k] }; });
    return SASH_CATS;
  }
  function sizeCode(s) { var m = String(s.size).match(/^\d{5,6}/); return m ? m[0] : ''; }
  function sashCodeIndex() { var o = {}; D.sash.forEach(function (s) { var c = sizeCode(s); if (c) o[c] = 1; }); return o; }
  function sashDim(s) {
    var c = sizeCode(s); if (!c) return s.type || '';
    var w = c.length === 6 ? c.slice(0, 3) : c.slice(0, 3), hh = c.length === 6 ? c.slice(3) : c.slice(3);
    var rest = String(s.size).slice(c.length).trim();
    return '幅' + w + '・高' + hh + (rest ? '　' + rest : '');
  }
  function sashUnitSell(s, glass) {
    var r = E.sashLine({ row: s.row, glass: glass || 'clear', qty: 1 }, R.v.genka);
    return r ? r.sell : 0;
  }
  function sashName(s) { return s.type || (/^AD/.test(s.label || '') ? '玄関ドア' : s.cat); }
  function isDoorType(s) { return /玄関|ドア|勝手口|店舗|引戸|ｼｬｯﾀｰ|ｵｰﾊﾞｰ/.test(s.type + s.cat); }
  function nextSym(list, prefix) {
    var max = 0; list.forEach(function (l) { var m = String(l.sym || '').match(new RegExp('^' + prefix + '(\\d+)')); if (m) max = Math.max(max, +m[1]); });
    return prefix + ('0' + (max + 1)).slice(-2);
  }
  function addSash(s) {
    var pre = /シャッター/.test(s.cat) ? 'SH' : isDoorType(s) ? 'AD' : 'AW';
    P.sash.push({ id: newId(), row: s.row, glass: 'clear', order: false, rac: false, qty: 1, sym: nextSym(P.sash, pre), room: '' });
    commit(); toast((s.type || '') + ' ' + s.size + ' を追加しました');
  }
  function loadSashStd() {
    var std = R.c.sash.std.lines;
    P.sash = std.map(function (l) {
      var sym = (l.item.label || '').replace(/\(.*\)/, '') || nextSym([], 'AW');
      return { id: newId(), row: l.row, glass: l.frost ? 'frost' : 'clear', order: false, rac: false, qty: l.qty, sym: sym, room: '' };
    });
    commit(); toast('標準セット（' + std.length + '行）を読み込みました');
  }
  function renderSash(main) {
    main.appendChild(pageHead('サッシ・玄関ドア', '図面の建具表を見ながら、種類とサイズをタップして追加します。標準セットから差し替えると差額だけがオプションになります。', [
      h('button', { type: 'button', class: 'btn', onclick: loadSashStd }, ['標準セットを読込']),
      P.sash.length ? h('button', { type: 'button', class: 'btn danger', onclick: function () { P.sash = []; commit(); } }, ['すべて外す']) : null
    ]));
    main.appendChild(diffbar(function (r) { return r.c.sash.std.sell; }, function (r) { return r.c.sash.sell; }, function (r) { return r.c.sash.opSell; }));

    // ---- 選択中
    var body = h('tbody');
    P.sash.forEach(function (l, i) {
      var s = E.SASH[l.row]; if (!s) return;
      var hasFrost = s.listF != null;
      var room = h('input', { class: 'inp', value: l.room || '', placeholder: '部屋', 'aria-label': '部屋', style: 'min-width:80px' });
      room.addEventListener('input', function () { l.room = room.value; saveSoon(); });
      var sym = h('input', { class: 'inp code', value: l.sym || '', 'aria-label': '符号', style: 'width:64px' });
      sym.addEventListener('input', function () { l.sym = sym.value; saveSoon(); });
      body.appendChild(h('tr', {}, [
        h('td', {}, [sym]),
        h('td', {}, [room]),
        h('td', {}, [h('div', {}, [h('strong', { text: sashName(s) }), ' ', h('span', { class: 'code', text: s.size })]), h('div', { class: 'muted', style: 'font-size:11.5px', text: s.cat === '標準' ? '標準仕様' : s.cat })]),
        h('td', {}, [h('div', { class: 'seg nowrap' }, [
          h('button', { type: 'button', class: 'chip', 'aria-pressed': l.glass !== 'frost' ? 'true' : 'false', onclick: function () { l.glass = 'clear'; commit(); } }, ['透明']),
          h('button', { type: 'button', class: 'chip', disabled: !hasFrost || null, 'aria-pressed': l.glass === 'frost' ? 'true' : 'false', onclick: function () { l.glass = 'frost'; commit(); } }, ['フロスト'])
        ])]),
        h('td', {}, [h('div', { class: 'stack', style: 'gap:2px' }, [
          miniToggle('オーダー', l, 'order', 'オーダーサイズ（×' + s.order + '）'),
          s.angle ? miniToggle('樹脂ｱﾝｸﾞﾙ', l, 'rac', '樹脂アングル（RAC）') : null
        ])]),
        h('td', {}, [stepper(function () { return l.qty; }, function (v) { l.qty = Math.max(0, v); }, { min: 0 })]),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.sash.lines.filter(function (y) { return y.line === l; })[0]; return x ? yen(x.sell) : '—'; })]),
        h('td', {}, [h('button', { type: 'button', class: 'icon-btn', 'aria-label': '削除', onclick: function () { P.sash.splice(i, 1); commit(); } }, ['×'])])
      ]));
    });
    var tbl = h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, ['符号', '部屋', '品目・サイズ', 'ガラス', 'オプション', '数量', '金額', ''].map(function (t, i) { return h('th', { class: i === 6 ? 'num' : null, text: t }); }))]),
      body,
      h('tfoot', {}, [h('tr', {}, [h('td', { colspan: 5, text: '合計（' + P.sash.length + '行）' }), h('td', {}, [live(function (r) { return r.c.sash.count + 'カ所'; })]), h('td', { class: 'num' }, [live(function (r) { return yen(r.c.sash.sell); })]), h('td')])])
    ])]);
    main.appendChild(card('選択中のサッシ', P.sash.length ? '行を追加・削除すると大工の取付手間も自動で増減します' : null,
      [P.sash.length ? tbl : h('div', { class: 'empty', text: 'まだ選ばれていません。「標準セットを読込」から始めるか、下の一覧から追加してください。' })]));

    // ---- カタログ
    var cats = sashCats();
    if (!ui.sashCat && !ui.sashSearch) ui.sashCat = '引き違い';
    var search = h('input', { class: 'inp search', type: 'search', id: 'sashSearch', placeholder: '寸法コード（例 16509）', value: ui.sashSearch });
    search.addEventListener('input', function () { ui.sashSearch = search.value.trim(); if (ui.sashSearch) ui.sashCat = null; drawGrid(); });
    var chips = h('div', { class: 'seg' }, cats.map(function (c) {
      return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.sashCat === c.name ? 'true' : 'false', onclick: function () { ui.sashCat = c.name; ui.sashSearch = ''; renderMain(); } }, [c.name]);
    }));
    var grid = h('div', { class: 'catalog' });
    function drawGrid() {
      grid.innerHTML = '';
      var list = [];
      if (ui.sashSearch) D.sash.forEach(function (s) { if (s.cat !== '標準' && String(s.size).indexOf(ui.sashSearch) >= 0) list.push(s); });
      else cats.forEach(function (c) { if (c.name === ui.sashCat) list = c.items; });
      if (!list.length) { grid.appendChild(h('div', { class: 'empty', text: '該当するサイズがありません' })); return; }
      list.forEach(function (s) {
        var ng = !s.list;
        grid.appendChild(h('button', { type: 'button', class: 'sku' + (ui.sashSearch && sizeCode(s) === ui.sashSearch ? ' hit' : ''), disabled: ng || null, onclick: function () { addSash(s); }, title: s.type + ' ' + s.size },
          [h('span', { class: 'code', text: sizeCode(s) || s.size }),
            h('span', { class: 'dim', text: sizeCode(s) ? (s.type + '　' + sashDim(s)) : s.type }),
            h('span', { class: 'price', text: ng ? '製作不可' : yen(sashUnitSell(s)) })]));
      });
    }
    drawGrid();
    var det = window.Plan && Plan.detected();
    var detCodes = det ? Object.keys(det.codes) : [];
    main.appendChild(card('サッシを追加', '金額は透明ガラス・標準サイズ1カ所の売価', [
      h('div', { class: 'stack' }, [
        h('div', { class: 'card-row' }, [chips]),
        h('div', { class: 'card-row' }, [search, detCodes.length ? h('div', { class: 'cand' }, [h('span', { class: 'muted', text: '図面から：' })].concat(detCodes.map(function (c) {
          return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.sashSearch === c ? 'true' : 'false', onclick: function () { ui.sashSearch = c; ui.sashCat = null; renderMain(); } }, [h('span', { class: 'code', text: c }), h('span', { class: 'badge', text: '×' + det.codes[c] })]);
        }))) : null]),
        grid
      ])
    ]));
  }
  function miniToggle(label, obj, key, title) {
    var id = 'mt_' + newId();
    var cb = h('input', { type: 'checkbox', id: id, checked: !!obj[key] || null });
    cb.addEventListener('change', function () { obj[key] = cb.checked; recompute(); });
    return h('label', { class: 'toggle mini', for: id, title: title || null }, [cb, h('span', { text: label })]);
  }

  // ------------------------------------------------------------------ 4. 建具（既製・造作）
  function doorGroups() {
    var g = {};
    D.doors.forEach(function (d) { if (d.group === 'フジタ標準' || d.group === 'PG標準') return; (g[d.group] = g[d.group] || []).push(d); });
    return g;
  }
  function doorLabel(d) { return (d.type || '') + '　' + (d.w ? num(d.w) + '×' + num(d.h) : ''); }
  function doorUnitSell(d, line) { var c = E.doorUnitCost(d, line || {}); return E.roundUp((c + n(d.daiku)) / R.v.genka, -2); }
  function loadDoorStd() {
    P.doors = R.c.door.std.lines.map(function (l) { return { id: newId(), row: l.row, qty: l.qty, design: l.item.design, lock: l.item.lock, special: false, sym: l.item.code || nextSym(P.doors, 'WD'), room: '' }; });
    commit(); toast('標準の既製建具を読み込みました');
  }
  function renderDoors(main) {
    main.appendChild(pageHead('建具', '内部の既製建具（大栄建材）と造作建具を選びます。既製建具は標準セットとの差額、造作建具は全額がオプションです。', [
      h('button', { type: 'button', class: 'btn', onclick: loadDoorStd }, ['既製建具の標準を読込']),
      P.doors.length ? h('button', { type: 'button', class: 'btn danger', onclick: function () { P.doors = []; commit(); } }, ['既製建具をすべて外す']) : null
    ]));
    main.appendChild(diffbar(function (r) { return r.c.door.std.sell; }, function (r) { return r.c.door.sell; }, function (r) { return r.c.door.opSell; }, ['既製建具 標準（取付費込）', '選択した合計（取付費込）', '差額（オプション）']));

    var body = h('tbody');
    P.doors.forEach(function (l, i) {
      var d = E.DOORS[l.row]; if (!d) return;
      var sym = h('input', { class: 'inp code', value: l.sym || '', style: 'width:64px', 'aria-label': '符号' });
      sym.addEventListener('input', function () { l.sym = sym.value; saveSoon(); });
      var room = h('input', { class: 'inp', value: l.room || '', placeholder: '部屋', style: 'min-width:80px', 'aria-label': '部屋' });
      room.addEventListener('input', function () { l.room = room.value; saveSoon(); });
      var des = h('select', { class: 'inp', style: 'min-height:32px;width:auto', 'aria-label': 'デザイン' },
        [h('option', { value: '', text: '標準デザイン' })].concat(designOptions(l.design)));
      des.addEventListener('change', function () { l.design = des.value; recompute(); });
      var lock = h('select', { class: 'inp', style: 'min-height:32px;width:auto', 'aria-label': '表示錠' },
        [h('option', { value: '', text: '錠なし' })].concat(D.doorLocks.map(function (k) { return h('option', { value: k.code, selected: l.lock === k.code || null, text: k.code + ' ' + k.name }); })));
      lock.addEventListener('change', function () { l.lock = lock.value; recompute(); });
      body.appendChild(h('tr', {}, [
        h('td', {}, [sym]), h('td', {}, [room]),
        h('td', {}, [h('strong', { text: d.type }), h('div', { class: 'muted', style: 'font-size:11.5px', text: (d.w ? num(d.w) + '×' + num(d.h) + '　' : '') + (d.frame || d.group) })]),
        h('td', {}, [des]), h('td', {}, [lock]),
        h('td', {}, [miniToggle('特寸', l, 'special', '特寸・オーダー（×' + D.doorNet.over + '）')]),
        h('td', {}, [stepper(function () { return l.qty; }, function (v) { l.qty = Math.max(0, v); }, { min: 0 })]),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.door.lines.filter(function (y) { return y.line === l; })[0]; return x ? yen(x.sell) : '—'; })]),
        h('td', {}, [h('button', { type: 'button', class: 'icon-btn', 'aria-label': '削除', onclick: function () { P.doors.splice(i, 1); commit(); } }, ['×'])])
      ]));
    });
    if (P.doors.length) body.appendChild(h('tr', {}, [h('td', { colspan: 7, class: 'muted', text: '取付調整費（1式）' }), h('td', { class: 'num' }, [live(function (r) { return yen(r.c.door.install.sell); })]), h('td')]));
    main.appendChild(card('選択中の既製建具', null, [P.doors.length ? h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, ['符号', '部屋', '品目', 'デザイン', '表示錠', '寸法', '数量', '金額', ''].map(function (t, i) { return h('th', { class: i === 7 ? 'num' : null, text: t }); }))]), body])])
      : h('div', { class: 'empty', text: '「既製建具の標準を読込」から始めると、変えた分だけが差額になります。' })]));

    // カタログ
    var groups = doorGroups(), gnames = Object.keys(groups);
    if (!ui.doorGroup || !groups[ui.doorGroup]) ui.doorGroup = gnames[0];
    var types = []; groups[ui.doorGroup].forEach(function (d) { if (types.indexOf(d.type) < 0) types.push(d.type); });
    if (!ui.doorType || types.indexOf(ui.doorType) < 0) ui.doorType = types[0];
    var list = groups[ui.doorGroup].filter(function (d) { return d.type === ui.doorType; });
    main.appendChild(card('既製建具を追加', '金額は標準デザイン1カ所の売価', [h('div', { class: 'stack' }, [
      h('div', { class: 'seg' }, gnames.map(function (g) { return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.doorGroup === g ? 'true' : 'false', onclick: function () { ui.doorGroup = g; ui.doorType = null; renderMain(); } }, [g]); })),
      h('div', { class: 'seg' }, types.map(function (t) { return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.doorType === t ? 'true' : 'false', onclick: function () { ui.doorType = t; renderMain(); } }, [t]); })),
      h('div', { class: 'catalog' }, list.map(function (d) {
        return h('button', { type: 'button', class: 'sku', onclick: function () {
          P.doors.push({ id: newId(), row: d.row, qty: 1, design: '', lock: /表示錠/.test(d.type) ? (/引/.test(d.type) ? 'KE-H' : 'KE-D') : '', special: false, sym: nextSym(P.doors, 'WD'), room: '' });
          commit(); toast(d.type + ' を追加しました');
        } }, [h('span', { class: 'code', text: d.w ? num(d.w) + '×' + num(d.h) : '—' }), h('span', { class: 'dim', text: d.frame || '' }), h('span', { class: 'price', text: yen(doorUnitSell(d, { design: '', lock: '' })) })]);
      }))
    ])]));

    // ---- 造作建具
    var zbody = h('tbody');
    P.zosaku.forEach(function (l, i) {
      var z = E.ZOSAKU[l.row]; if (!z) return;
      zbody.appendChild(h('tr', {}, [
        h('td', { class: 'code', text: z.sym }),
        h('td', {}, [h('strong', { text: z.type }), h('div', { class: 'muted', style: 'font-size:11.5px', text: 'W' + z.w + '・H' + z.h })]),
        h('td', { text: z.spec }),
        h('td', {}, [stepper(function () { return l.qty; }, function (v) { l.qty = Math.max(0, v); }, { min: 0 })]),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.zosaku.lines.filter(function (y) { return y.line === l; })[0]; return x ? yen(x.sell) : '—'; })]),
        h('td', {}, [h('button', { type: 'button', class: 'icon-btn', 'aria-label': '削除', onclick: function () { P.zosaku.splice(i, 1); commit(); } }, ['×'])])
      ]));
    });
    if (P.zosaku.length) zbody.appendChild(h('tr', {}, [h('td'), h('td', { colspan: 3 }, [live(function (r) { return r.c.zosaku.install ? r.c.zosaku.install.label : '搬入取付費（計上しない）'; })]), h('td', { class: 'num' }, [live(function (r) { return r.c.zosaku.install ? yen(r.c.zosaku.install.sell) : '—'; })]), h('td')]));
    var syms = []; D.zosaku.forEach(function (z) { if (syms.indexOf(z.sym) < 0) syms.push(z.sym); });
    var zlist = D.zosaku.filter(function (z) { return z.sym === ui.zosakuSym; });
    var head = zlist[0];
    main.appendChild(card('造作建具', '全額オプション（大工の取付手間も自動計上）', [h('div', { class: 'stack' }, [
      P.zosaku.length ? h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['記号', '種類', '仕様', '数量', '金額', ''].map(function (t, i) { return h('th', { class: i === 4 ? 'num' : null, text: t }); }))]), zbody])]) : null,
      toggle('搬入取付費を枚数に応じて自動計上（1〜3枚／4〜8枚／9〜12枚）', 'zosakuInstallAuto'),
      h('div', { class: 'seg' }, syms.map(function (s) {
        var z = D.zosaku.filter(function (x) { return x.sym === s; })[0];
        return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.zosakuSym === s ? 'true' : 'false', onclick: function () { ui.zosakuSym = s; renderMain(); } }, [s + '：' + z.type.replace(/\s.*$/, '') + '（W' + z.w + '・H' + z.h + '）']);
      })),
      head ? h('p', { class: 'note', text: head.type }) : null,
      h('div', { class: 'catalog' }, zlist.map(function (z) {
        return h('button', { type: 'button', class: 'sku', onclick: function () { P.zosaku.push({ id: newId(), row: z.row, qty: 1 }); commit(); toast('造作建具 ' + z.sym + ' を追加しました'); } },
          [h('span', { class: 'dim', style: 'font-size:12px;color:var(--ink)', text: z.spec }), h('span', { class: 'price', text: yen(E.roundUp((z.cost + z.hw + z.daiku) / R.v.genka, -2)) })]);
      }))
    ])]));
  }
  function designOptions(cur) {
    return D.doorDesigns.map(function (d) {
      var add = Math.round(d.list * D.doorNet.base / R.v.genka / 100) * 100;
      return h('option', { value: d.code, selected: cur === d.code || null, text: d.code + '（' + (add >= 0 ? '+' : '') + num(add) + '円）' });
    });
  }

  // ------------------------------------------------------------------ 5. 収納
  function renderStorage(main) {
    main.appendChild(pageHead('収納', '固定棚・可動棚を部屋ごとに入れます。固定棚は1行でも入れると「標準4面」との差額計算に切り替わるので、標準分も含めてすべて入れてください。'));
    var shelfOp = function (r) { return rowsSellR(r, [719, 762, 701]); };
    var stdTxt = D.shelves.filter(function (s) { return s.std; }).map(function (s) { return s.kind.replace(/\s.*$/, '') + ' ' + s.size + '×' + s.std; }).join('、');
    // 固定棚
    var body = h('tbody');
    P.shelves.forEach(function (l, i) {
      var s = E.SHELVES[l.row]; if (!s) return;
      var room = h('input', { class: 'inp', value: l.room || '', placeholder: '部屋', style: 'min-width:80px', 'aria-label': '部屋' });
      room.addEventListener('input', function () { l.room = room.value; saveSoon(); });
      body.appendChild(h('tr', {}, [
        h('td', {}, [room]),
        h('td', {}, [h('strong', { text: s.kind.replace(/\s+/g, ' ') }), ' ', h('span', { text: s.size })]),
        h('td', {}, [stepper(function () { return l.qty; }, function (v) { l.qty = Math.max(0, v); }, { min: 0 })]),
        h('td', {}, [s.side ? stepper(function () { return l.side; }, function (v) { l.side = Math.max(0, v); }, { min: 0, label: '側板' }) : h('span', { class: 'muted', text: '—' })]),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.shelf.lines.filter(function (y) { return y.line === l; })[0]; return x ? yen(x.sell) : '—'; })]),
        h('td', {}, [h('button', { type: 'button', class: 'icon-btn', 'aria-label': '削除', onclick: function () { P.shelves.splice(i, 1); commit(); } }, ['×'])])
      ]));
    });
    var kinds = []; D.shelves.forEach(function (s) { if (kinds.indexOf(s.kind) < 0) kinds.push(s.kind); });
    if (!ui.shelfKind) ui.shelfKind = kinds[1] || kinds[0];
    main.appendChild(card('固定棚', '標準：' + stdTxt, [h('div', { class: 'stack' }, [
      h('div', { class: 'diffbar' }, [
        h('div', {}, [h('span', { class: 'lbl', text: '標準（本体に含む）' }), h('strong', { text: R.c.shelf.std.count + '面' })]),
        h('div', {}, [h('span', { class: 'lbl', text: '入力した棚' }), live(function (r) { return r.c.shelf.has ? r.c.shelf.count + '面' : '未入力（標準のまま）'; }, '', 'strong')]),
        h('div', {}, [h('span', { class: 'lbl', text: '差額（材料・金物・手間）' }), liveCls(live(function (r) { return signedYen(shelfOp(r)); }, '', 'strong'), function (r) { return cls(shelfOp(r)); })])
      ]),
      P.shelves.length ? h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['部屋', '種類・サイズ', '棚', '側板', '参考売価', ''].map(function (t, i) { return h('th', { class: i === 4 ? 'num' : null, text: t }); }))]), body])]) : null,
      h('div', { class: 'seg' }, kinds.map(function (k) { return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.shelfKind === k ? 'true' : 'false', onclick: function () { ui.shelfKind = k; renderMain(); } }, [k.replace(/\s+/g, ' ').replace(/※.*$/, '')]); })),
      h('div', { class: 'catalog' }, D.shelves.filter(function (s) { return s.kind === ui.shelfKind; }).map(function (s) {
        return h('button', { type: 'button', class: 'sku', onclick: function () { P.shelves.push({ id: newId(), row: s.row, qty: 1, side: 0, room: '' }); commit(); } },
          [h('span', { class: 'code', text: s.size }), h('span', { class: 'price', text: yen(E.roundUp((s.board + s.pipe + s.hanger + s.install) / R.v.genka, -2)) })]);
      }))
    ])]));

    // 可動棚
    var kb = h('tbody');
    P.kadou.lines.forEach(function (l, i) {
      var k = E.KADOU[l.row]; if (!k) return;
      kb.appendChild(h('tr', {}, [
        h('td', {}, [h('strong', { text: k.label.replace(/\s+/g, ' ') }), ' ', h('span', { text: k.b || '' })]),
        h('td', {}, [stepper(function () { return l.qty; }, function (v) { l.qty = Math.max(0, v); }, { min: 0 })]),
        h('td', {}, [k.kind === 'board' ? stepper(function () { return l.side; }, function (v) { l.side = Math.max(0, v); }, { min: 0, label: '側板' }) : h('span', { class: 'muted', text: '—' })]),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.kadou.lines.filter(function (y) { return y.line === l; })[0]; return x ? yen(x.sell) : '—'; })]),
        h('td', {}, [h('button', { type: 'button', class: 'icon-btn', 'aria-label': '削除', onclick: function () { P.kadou.lines.splice(i, 1); commit(); } }, ['×'])])
      ]));
    });
    var labels = []; D.kadou.items.forEach(function (k) { if (labels.indexOf(k.label) < 0) labels.push(k.label); });
    if (!ui.kadouLabel) ui.kadouLabel = labels[0];
    main.appendChild(card('可動棚', '箇所数ごとに大工の取付手間が付きます', [h('div', { class: 'stack' }, [
      h('div', { class: 'card-row' }, [h('span', { text: '収納箇所数' }), stepper(function () { return P.kadou.places; }, function (v) { P.kadou.places = Math.max(0, v); }, { min: 0 }),
        h('span', { class: 'muted' }, ['差額 ', liveCls(live(function (r) { return signedYen(rowsSellR(r, [720, 763, 702])); }), function (r) { return cls(rowsSellR(r, [720, 763, 702])); })])]),
      P.kadou.lines.length ? h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['品目', '数量', '側板', '参考売価', ''].map(function (t, i) { return h('th', { class: i === 3 ? 'num' : null, text: t }); }))]), kb])]) : null,
      h('div', { class: 'seg' }, labels.map(function (k) { return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.kadouLabel === k ? 'true' : 'false', onclick: function () { ui.kadouLabel = k; renderMain(); } }, [k.replace(/\s+/g, ' ').slice(0, 22)]); })),
      h('div', { class: 'catalog' }, D.kadou.items.filter(function (k) { return k.label === ui.kadouLabel; }).map(function (k) {
        return h('button', { type: 'button', class: 'sku', onclick: function () { P.kadou.lines.push({ id: newId(), row: k.row, qty: 1, side: 0 }); commit(); } },
          [h('span', { class: 'code', text: k.b ? (k.kind === 'board' ? 'D' + k.b : k.b) : (k.len ? 'L' + k.len : '—') }), h('span', { class: 'price', text: yen(E.roundUp(k.cost / R.v.genka, -2)) })]);
      }))
    ])]));
  }

  // ------------------------------------------------------------------ 6. 電気・設備
  function renderEquip(main) {
    main.appendChild(pageHead('電気・設備', '標準（3LDK＋2FWIC＋1F・2Fトイレ＋1FUT＋洗面脱衣）からの増減を入れます。部屋を増やすと配線・スイッチ・コンセント・照明が自動で増えます。'));
    main.appendChild(card('間取りの増減', null, [h('div', { class: 'grid g3' }, [
      h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '居室（CL照明）' }), stepper(function () { return P.q.kyoshitsu; }, function (v) { P.q.kyoshitsu = v; }, { rerender: true })]),
      h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '非居室（DL照明）' }), stepper(function () { return P.q.hikyoshitsu; }, function (v) { P.q.hikyoshitsu = v; }, { rerender: true })]),
      h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '電気工事区分' }), seg(['標準', '特別平屋', '特別2F', 'PG'], 'elecKubun')])
    ]), h('div', { class: 'seg', style: 'margin-top:10px' }, [
      toggle('第一種換気にする', 'f.dai1', { rerender: true }), toggle('HEMSによる見える化', 'f.hems'), toggle('引込ポールあり', 'f.pole')
    ]), R.c.elec.dai1Body ? h('p', { class: 'callout', style: 'margin-top:8px' }, ['第一種換気 本体（' + R.c.elec.dai1Body.maker + '）は電気工事とは別に請求：参考 ' + yen(R.c.elec.dai1Body.sell)]) : null,
    h('div', { class: 'grid g4', style: 'margin-top:10px' }, [
      numField('換気レジスター', 'q.register', '台', { hint: 'TW換気ベンドキャップ' }),
      R.v.kani ? numField('外部DL（簡易時）', 'q.lightDLout', '台') : null,
      R.v.kani ? numField('内部DL（簡易時）', 'q.lightDLin', '台') : null,
      R.v.kani ? numField('CL（簡易時）', 'q.lightCL', '台') : null
    ])]));

    var eb = h('tbody');
    R.c.elec.lines.forEach(function (l) {
      var it = l.item;
      eb.appendChild(h('tr', {}, [
        h('td', {}, [h('strong', { text: it.name }), it.sub ? h('span', { class: 'muted', text: ' ' + it.sub }) : null]),
        h('td', { class: 'num', text: it.std || '—' }),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.elec.lines.filter(function (y) { return y.item.col === it.col; })[0]; return x.auto ? (x.auto > 0 ? '+' : '') + x.auto : '—'; })]),
        h('td', {}, [stepper(function () { return P.elec[it.col] || 0; }, function (v) { P.elec[it.col] = v; })]),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.elec.lines.filter(function (y) { return y.item.col === it.col; })[0]; return yen(x.unitSell); })]),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.elec.lines.filter(function (y) { return y.item.col === it.col; })[0]; return x.delta ? signedYen(x.sell) : '—'; })])
      ]));
    });
    main.appendChild(card('電気（標準からの増減）', null, [h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, ['項目', '標準数', '自動', '追加・削減', '単価', '金額'].map(function (t, i) { return h('th', { class: i ? 'num' : null, text: t }); }))]), eb,
      h('tfoot', {}, [h('tr', {}, [h('td', { colspan: 5, text: '電気工事 変更差額' }), h('td', { class: 'num' }, [live(function (r) { return signedYen(r.c.elec.sell); })])])])
    ])])]));

    var pb = h('tbody');
    R.c.plumb.lines.forEach(function (l) {
      var it = l.item;
      pb.appendChild(h('tr', {}, [
        h('td', {}, [h('strong', { text: it.name })]),
        h('td', { class: 'num', text: it.std || '—' }),
        h('td', {}, [stepper(function () { return P.plumb[it.col] || 0; }, function (v) { P.plumb[it.col] = v; })]),
        h('td', { class: 'num', text: yen(l.unitSell) }),
        h('td', { class: 'num' }, [live(function (r) { var x = r.c.plumb.lines.filter(function (y) { return y.item.col === it.col; })[0]; return x.delta ? signedYen(x.sell) : '—'; })])
      ]));
    });
    main.appendChild(card('給排水・住設', null, [h('div', { class: 'stack' }, [
      h('div', { class: 'seg' }, [toggle('2Fにトイレ（配管＋便器）', 'f.toilet2F', { rerender: true }), toggle('2F手洗（トイレから分岐）', 'f.tearaiBranch', { rerender: true }), toggle('2F手洗（トイレと別配管）', 'f.tearaiSep', { rerender: true })]),
      P.f.toilet2F && P.f.choki ? h('p', { class: 'note', text: '2F水回り＋長期優良住宅のため、サヤ管工事を自動計上しています。' }) : null,
      h('div', { class: 'field' }, [h('span', { class: 'lbl', text: 'キッチンカウンター（家具工事）' }), seg([{ value: '', label: 'なし' }, { value: '1700', label: 'L=1700' }, { value: '2600', label: 'L=2600' }], 'counter')]),
      h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
        h('thead', {}, [h('tr', {}, ['配管', '標準数', '追加・削減', '単価', '金額'].map(function (t, i) { return h('th', { class: i ? 'num' : null, text: t }); }))]), pb
      ])]),
      h('p', { class: 'note', text: '住宅設備機器（キッチン・UB等）の変更は「外部・内部OP」の自由入力で追加してください。標準品は本体に含まれています。' })
    ])]));
  }

  // ------------------------------------------------------------------ 7. 外部・内部OP
  var MANUAL_OP_ROWS = [722, 723, 724, 725, 726, 728, 729, 731, 732, 733, 734, 735, 740, 745, 746, 853, 854, 920, 921, 793, 794, 795, 796, 797, 798, 800, 801, 802, 803, 804, 805, 806, 807, 808, 782, 979, 1006, 1014];
  function renderOptions(main) {
    main.appendChild(pageHead('外部・内部オプション', '図面の形状から決まる割増や、標準外の造作を入れます。数量を入れると単価表から自動で計上されます。'));
    main.appendChild(card('外部', null, [h('div', { class: 'grid g4' }, [
      numField('高基礎', 'q.takaKiso', 'm'),
      numField('軒の出', 'q.nokiDe', 'm'),
      numField('軒の出＋下がり壁', 'q.nokiSagari', 'm'),
      numField('うち軒の出600以上', 'q.noki600', 'm'),
      numField('目隠塀1F 笠木あり', 'len.kasa1', 'm'),
      numField('目隠塀1F 笠木なし', 'len.nokasa1', 'm'),
      numField('目隠塀2F 笠木あり', 'len.kasa2', 'm'),
      numField('目隠塀2F 笠木なし', 'len.nokasa2', 'm'),
      numField('パラペット', 'len.parapet', 'm'),
      numField('屋根無しポーチ', 'q.porchNoRoof', '㎡'),
      numField('2重床（床上げ）', 'q.nijuyuka', '坪'),
      numField('外部収納 巾', 'q.gaibuW', 'm'),
      numField('外部収納 奥行', 'q.gaibuD', 'm'),
      numField('構造用合板9㎜ 真壁', 'q.shinkabeGoban', '箇所'),
      numField('内部足場', 'q.naibuAshiba', '人工', { hint: '天井高2.5m以上など' }),
      numField('軒先換気', 'q.nokisakiKanki', 'm')
    ])]));
    main.appendChild(card('屋根・樋・外壁', '屋根数量は標準（本体）の板金屋根。瓦にする場合は板金分の原価を控除します', [h('div', { class: 'stack' }, [
      h('div', { class: 'grid g4' }, [
        numField('大屋根 面積', 'q.roof1.area', '㎡'), numField('大屋根 唐草', 'q.roof1.karakusa', 'm'), numField('大屋根 谷', 'q.roof1.tani', 'm'), numField('大屋根 棟', 'q.roof1.mune', 'm'),
        numField('大屋根 雪止め', 'q.roof1.yukidome', 'm'), numField('下屋 面積', 'q.roof2.area', '㎡'), numField('下屋 唐草', 'q.roof2.karakusa', 'm'), numField('下屋 雪止め', 'q.roof2.yukidome', 'm'),
        numField('軒樋', 'q.toi.noki', 'm'), numField('集水器', 'q.toi.shusui', '箇所', { hint: '屋根35㎡に1個' }), numField('竪樋', 'q.toi.tate', 'm'), numField('入樋', 'q.toi.hai', '箇所')
      ]),
      h('div', { class: 'seg' }, [toggle('大屋根を瓦にする', 'f.oyaneKawara', { rerender: true }), toggle('下屋を瓦にする', 'f.geyaKawara', { rerender: true }), toggle('外壁を他の仕上げにする', 'f.gaihekiOther', { rerender: true }), toggle('Kダンパー＋タイガーEX', 'f.kdamper', { rerender: true })]),
      (P.f.oyaneKawara || P.f.geyaKawara) ? h('div', { class: 'grid g4' }, [numField('瓦 水切付鼻桟', 'q.kawaraHana', 'm'), numField('瓦 登り淀', 'q.kawaraNobori', 'm')]) : null,
      P.f.kdamper ? h('div', { class: 'grid g4' }, [numField('1F・2F 総壁', 'q.kdamperWallM', 'm', { hint: 'Kダンパーのみなら0' })]) : null,
      h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '軒天AEP塗装の色' }), seg(['淡', '濃'], 'nokitenColor')])
    ])]));
    main.appendChild(card('内部', null, [h('div', { class: 'stack' }, [
      h('div', { class: 'seg' }, [toggle('法22条（天井裏ボード貼り）', 'f.hou22', { rerender: true })]),
      h('div', { class: 'grid g4' }, [
        numField('手摺壁（腰壁）', 'q.koshikabe', 'm'), numField('カウンター取付', 'q.counterCnt', 'カ所'), numField('下足箱取付', 'q.getabakoCnt', 'カ所'),
        numField('上がり框 取付', 'q.agarigamachiCnt', 'カ所'), numField('上がり框 長さ', 'q.agarigamachiLen', 'm'),
        numField('CF 1F', 'q.cf1', '㎡'), numField('CF 2F', 'q.cf2', '㎡'), numField('長尺シート 1F', 'q.choshaku1', '㎡'), numField('長尺シート 2F', 'q.choshaku2', '㎡'),
        numField('カーペット 1F', 'q.carpet1', '㎡'), numField('カーペット 2F', 'q.carpet2', '㎡'),
        numField('巾木 総延長', 'q.habaki', 'm'), numField('うちLDK・ホール廻縁', 'q.mawaribuchi', 'm'), numField('出隅コーナー', 'q.habakiCorner', '箇所'),
        numField('丸棒手摺 端部', 'q.tesuriEnd', '箇所'), numField('玄関タイル', 'q.tile', '㎡'), numField('タイル立上り', 'q.tileRise', 'm')
      ]),
      h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '吹付断熱' }), seg([{ value: 466, label: '屋根175/壁95' }, { value: 467, label: '屋根200/壁95' }, { value: 468, label: '屋根250/壁95' }, { value: 469, label: '屋根300/壁95' }], 'fukitsuke')]),
      h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '床下断熱（フジタ仕様）' }), seg([{ value: 50, label: '厚50' }, { value: 75, label: '厚75' }, { value: 90, label: '厚90' }, { value: 100, label: '厚100' }], 'yukashita')])
    ])]));

    // 単価表からの手入力行
    var tb = h('tbody'), lastGroup = '';
    MANUAL_OP_ROWS.forEach(function (row) {
      var it = E.KOUJI[row]; if (!it) return;
      var g = it.group || it.sec;
      if (g !== lastGroup) { tb.appendChild(h('tr', { class: 'sec-row' }, [h('td', { colspan: 5, text: g.replace(/^【|】$/g, '') })])); lastGroup = g; }
      var o = P.overrides[row] || (P.overrides[row] = {});
      var needPrice = it.price == null;
      tb.appendChild(h('tr', {}, [
        h('td', {}, [h('strong', { text: it.name || '（' + it.spec + '）' }), it.spec && it.name ? h('div', { class: 'muted', style: 'font-size:11.5px', text: it.spec }) : null]),
        h('td', {}, [needPrice ? inputNum('overrides.' + row + '.price', { tiny: true, placeholder: '原価を入力' }) : h('span', { class: 'num', text: yen(it.price * (it.net || 1)) + ' 原価' })]),
        h('td', {}, [stepper(function () { return o.qty; }, function (v) { o.qty = v > 0 ? v : ''; })]),
        h('td', { text: it.unit || it.h }),
        h('td', { class: 'num' }, [live(function (r) { var x = r.lines.filter(function (y) { return y.row === row; })[0]; return x && x.sell ? yen(x.sell) : '—'; })])
      ]));
    });
    main.appendChild(card('建材・外装などの追加', '単価表（契約内訳）の項目。数量を入れると原価率で売価を計上', [h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, ['項目', '単価', '数量', '単位', '金額'].map(function (t, i) { return h('th', { class: i === 4 ? 'num' : null, text: t }); }))]), tb])])]));

    // 自由入力
    var xb = h('tbody');
    P.extras.forEach(function (x, i) {
      function txt(key, ph, w) { var el = h('input', { class: 'inp', value: x[key] || '', placeholder: ph, style: w ? 'width:' + w : null, 'aria-label': ph }); el.addEventListener('input', function () { x[key] = el.value; saveSoon(); }); return el; }
      function nm(key, ph) { var el = h('input', { class: 'inp num tiny', inputmode: 'decimal', value: x[key] === '' || x[key] == null ? '' : x[key], placeholder: ph, 'aria-label': ph }); el.addEventListener('input', function () { x[key] = el.value === '' ? '' : +el.value; recompute(); }); return el; }
      xb.appendChild(h('tr', {}, [
        h('td', {}, [txt('name', '名称')]), h('td', {}, [txt('spec', '仕様')]), h('td', {}, [nm('qty', '数量')]), h('td', {}, [txt('unit', '単位', '56px')]),
        h('td', {}, [nm('sell', '売価単価')]), h('td', {}, [nm('cost', '原価単価')]),
        h('td', { class: 'num' }, [live(function () { return yen(n(x.sell) * n(x.qty)); })]),
        h('td', {}, [h('button', { type: 'button', class: 'icon-btn', 'aria-label': '削除', onclick: function () { P.extras.splice(i, 1); commit(); } }, ['×'])])
      ]));
    });
    main.appendChild(card('自由入力のオプション', '住設のグレードアップ、外構、エアコンなど単価表にないもの', [h('div', { class: 'stack' }, [
      P.extras.length ? h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['名称', '仕様', '数量', '単位', '売価単価', '原価単価', '金額', ''].map(function (t, i) { return h('th', { class: i === 6 ? 'num' : null, text: t }); }))]), xb])]) : null,
      h('div', {}, [h('button', { type: 'button', class: 'btn', onclick: function () { P.extras.push({ id: newId(), name: '', spec: '', qty: 1, unit: '式', sell: '', cost: '' }); commit(); } }, ['＋ 行を追加'])])
    ])]));
  }

  // ------------------------------------------------------------------ 8. 付帯・申請
  function renderFutai(main) {
    main.appendChild(pageHead('付帯工事・申請', '敷地条件で変わる付帯工事と、申請・保険の有無を決めます。付帯工事の金額はお客様向けの定額（資金計画書と同じ）です。'));
    var F = [
      ['est.futai.chosa', '敷地調査費', '現地調査・役所調査・現地測量'],
      ['est.futai.jiban', '地盤調査費', '長期20年保証（工法による）'],
      ['est.futai.kasetsu', '共通仮設工事費', '仮囲い・仮設トイレ・仮設電気・仮設水道 等'],
      ['est.futai.jigyo', '地業・整地工事費', '基礎施工時の建物直下残土処理 他'],
      ['est.futai.kansen', '屋外幹線引込工事費', '屋外幹線の引込工事'],
      ['est.futai.haisui', '屋外給排雨水工事', '上水・下水・雨水（6mまで）'],
      ['est.futai.zousei', '造成工事', '必要な敷地の場合のみ'],
      ['est.futai.jokaso', '浄化槽設置工事', '下水道がない場合'],
      ['est.futai.gas', '都市ガス対応工事', '都市ガス採用の場合'],
      ['est.futai.chiiki', '地域調整費', '能登地方・隣県で施工の場合'],
      ['est.futai.solar', '太陽光発電', '']
    ];
    main.appendChild(card('付帯工事（お客様向け金額・税抜）', null, [h('div', { class: 'stack' }, [
      h('div', { class: 'grid g3' }, F.map(function (f) { return numField(f[1], f[0], '円', { hint: f[2] }); })),
      h('div', { class: 'grid g3' }, [numField('屋外給排雨水の延長', 'q.haisuiLen', 'm', { hint: '6m超過分は1mあたり10,000円加算' })]),
      h('div', { class: 'seg' }, [toggle('電気引込ポールが必要（旗竿地等）', 'f.pole'), toggle('建て替え（地盤調査費×1.5）', 'f.tatekae'), toggle('地鎮祭をする', 'f.jichinsai'), toggle('草刈りを見る', 'f.kusakari')]),
      h('div', { class: 'grid g3' }, [numField('クロスゲート', 'q.crossGate', '基'), numField('ケアネット', 'q.careNet', 'm', { placeholder: '空欄＝敷地外周' })])
    ])]));
    main.appendChild(card('申請・保険', null, [h('div', { class: 'stack' }, [
      h('div', { class: 'seg' }, [toggle('確認申請', 'f.kakunin', { rerender: true }), toggle('性能評価', 'f.seinou', { rerender: true }), toggle('BELS', 'f.bels', { rerender: true }), toggle('長期優良住宅', 'f.choki', { rerender: true }), toggle('瑕疵担保保険', 'f.kashi', { rerender: true })]),
      h('p', { class: 'note', text: '構造計算は耐震等級3で自動計上（基本情報で選択）。長期優良住宅の認定料は申請先の市町で変わります（' + P.info.city + '）。' }),
      h('div', { class: 'grid g3' }, [numField('確認申請 行政手数料（原価）', 'kakuninCost', '円', { hint: '役所で調べて入力' })])
    ])]));
    main.appendChild(card('申請費用他（見積書B）', null, [h('div', { class: 'grid g3' }, [
      numField('設計費用 坪単価', 'est.designUnit', '円/坪'),
      numField('申請費用', 'est.shinsei', '円'),
      numField('諸経費の調整', 'est.shokeihiAdj', '円', { hint: '端数調整用（±）' })
    ])]));
  }

  // ------------------------------------------------------------------ 9. 見積書
  function estimateRows(r) {
    var e = r.est, rows = [];
    rows.push({ grp: 'Ａ　建築本体工事' });
    rows.push({ name: '建築本体工事', spec: '', qty: num(r.v.sekouT, 2), unit: '坪', price: e.A.tsubo, amount: e.A.honTai });
    rows.push({ sub: '付帯工事費' });
    e.A.futai.forEach(function (f) { if (f.amount) rows.push({ name: '　' + f.name, spec: f.spec || '', qty: 1, unit: '式', amount: f.amount }); });
    if (e.A.discount) rows.push({ name: '端数調整値引', amount: e.A.discount });
    rows.push({ name: '消費税', qty: 1, unit: '式', amount: e.A.tax });
    rows.push({ total: 'Ａ．建築本体合計', amount: e.A.total });
    rows.push({ grp: 'Ｂ　申請費用他' });
    rows.push({ name: '設計費用', spec: '基本設計費・実施設計費・コーディネート費', qty: num(r.v.sekouT, 2), unit: '坪', price: e.B.designUnit, amount: e.B.design });
    rows.push({ name: '申請費用', spec: '書類作成及び申請手数料', qty: 1, unit: '式', amount: e.B.shinsei });
    rows.push({ name: '諸経費', spec: '施工手引書による管理費', qty: 1, unit: '式', amount: e.B.shokeihi });
    if (e.B.discount) rows.push({ name: '端数調整値引', amount: e.B.discount });
    rows.push({ name: '消費税', qty: 1, unit: '式', amount: e.B.tax });
    rows.push({ total: 'Ｂ．申請費用他合計', amount: e.B.total });
    rows.push({ grp: 'Ｃ　標準外オプション工事費' });
    e.C.lines.forEach(function (l) { if (l.sell) rows.push({ name: l.name, spec: l.spec, qty: 1, unit: '式', amount: l.sell }); });
    if (!e.C.lines.some(function (l) { return l.sell; })) rows.push({ name: '（オプションなし）', amount: 0 });
    if (e.C.discount) rows.push({ name: '端数調整値引', amount: e.C.discount });
    rows.push({ name: '消費税', qty: 1, unit: '式', amount: e.C.tax });
    rows.push({ total: 'Ｃ．オプション工事合計', amount: e.C.total });
    rows.push({ grand: '契約金額（Ａ＋Ｂ＋Ｃ）', amount: e.total });
    return rows;
  }
  function renderEstimate(main) {
    var e = R.est;
    var actions = [];
    if (!IN_FRAME) actions.push(h('button', { type: 'button', class: 'btn primary', onclick: function () { window.print(); } }, ['印刷・PDF保存']));
    actions.push(h('button', { type: 'button', class: 'btn', onclick: copyTsv }, ['Excel貼付用にコピー']));
    main.appendChild(pageHead('見積書', '本体は「施工面積×坪単価」。坪単価は積算（標準工事＋付帯＋諸経費＋設計）と見積合計が合うよう自動で出しています。', actions));

    main.appendChild(card('坪単価・値引き', null, [h('div', { class: 'stack' }, [
      h('div', { class: 'grid g4' }, [
        h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '自動算出の坪単価' }), live(function (r) { return yen(r.est.A.tsuboAuto) + ' /坪'; }, '', 'strong')]),
        numField('採用する坪単価', 'est.tsubo', '円', { placeholder: '空欄＝自動' }),
        numField('Ａの端数調整値引', 'est.discountA', '円', { hint: 'マイナスで入力' }),
        numField('Ｃの端数調整値引', 'est.discountC', '円', { hint: 'マイナスで入力' })
      ]),
      n(P.est.tsubo) ? h('p', { class: 'note' }, ['坪単価を手入力中です。', h('button', { type: 'button', class: 'btn small', onclick: function () { P.est.tsubo = ''; commit(); } }, ['自動に戻す'])]) : null
    ])], 'no-print'));

    // ---- 御見積書
    var sheet = h('article', { class: 'sheet', 'aria-label': '御見積書' });
    sheet.appendChild(h('h2', { class: 'doc-title', text: '御見積書' }));
    sheet.appendChild(h('div', { class: 'doc-head' }, [
      h('div', {}, [
        h('div', { class: 'client' }, [P.info.client || '　　　　　　', h('small', { text: '様' })]),
        h('p', { style: 'margin:10px 0 0;font-size:13px', text: '下記の通り御見積申し上げます。' }),
        h('div', { class: 'doc-total' }, [h('span', { text: '御見積金額' }), h('span', { class: 'yen', text: yen(e.total) }), h('span', { style: 'font-size:12px', text: '（消費税10%を含む）' })]),
        h('dl', { class: 'meta' }, [
          h('dt', { text: '工事名' }), h('dd', { text: P.info.name || '—' }),
          h('dt', { text: '工事場所' }), h('dd', { text: P.info.site || '—' }),
          h('dt', { text: '施工面積' }), h('dd', { text: num(R.v.sekou, 2) + '㎡（' + num(R.v.sekouT, 2) + '坪）　延床 ' + num(R.v.nobe, 2) + '㎡' }),
          h('dt', { text: '仕様' }), h('dd', { text: P.spec + '仕様・' + (P.floors || '—') + (P.taishin ? '・耐震等級' + P.taishin : '') }),
          h('dt', { text: '支払条件' }), h('dd', { text: '契約書による' }),
          h('dt', { text: '有効期限' }), h('dd', { text: '作成より一ヵ月' })
        ])
      ]),
      h('div', { class: 'issuer' }, [
        h('div', { text: P.info.date ? P.info.date.replace(/-/g, '.') : '' }),
        (function () {
          var el = h('div', { contenteditable: 'true', 'aria-label': '発行者（クリックで編集）', style: 'margin-top:16px;min-height:3.6em;white-space:pre-line' });
          el.textContent = P.info.company || '（会社名・住所・電話）';
          el.addEventListener('input', function () { P.info.company = el.innerText; saveSoon(); });
          return el;
        })(),
        P.info.staff ? h('div', { text: '担当：' + P.info.staff }) : null
      ])
    ]));
    var tb = h('tbody');
    var no = 0;
    estimateRows(R).forEach(function (r) {
      if (r.grp) { tb.appendChild(h('tr', { class: 'grp' }, [h('td', { colspan: 6, text: r.grp })])); return; }
      if (r.sub) { tb.appendChild(h('tr', {}, [h('td', { text: String(++no) }), h('td', { colspan: 5, text: r.sub })])); return; }
      if (r.total) { tb.appendChild(h('tr', { class: 'subtotal' }, [h('td'), h('td', { colspan: 4, text: r.total }), h('td', { class: 'num', text: yen(r.amount) })])); return; }
      if (r.grand) { tb.appendChild(h('tr', { class: 'grand' }, [h('td'), h('td', { colspan: 4, text: r.grand }), h('td', { class: 'num', text: yen(r.amount) })])); return; }
      tb.appendChild(h('tr', {}, [h('td', { text: String(++no) }), h('td', { text: r.name }), h('td', { text: r.spec || '' }), h('td', { class: 'num', text: r.qty != null ? r.qty + (r.unit ? ' ' + r.unit : '') : '' }),
        h('td', { class: 'num', text: r.price ? yen(r.price) : '' }), h('td', { class: 'num', text: yen(r.amount) })]));
    });
    sheet.appendChild(h('table', {}, [h('thead', {}, [h('tr', {}, ['No', '名称', '仕様', '数量', '単価', '金額'].map(function (t) { return h('th', { text: t }); }))]), tb]));
    sheet.appendChild(h('p', { class: 'doc-note', text: '※付帯工事は敷地調査後に、申請費用他は図面決定後に確定します。※解体・外構・エクステリア・地盤改良・空調・照明器具・カーテン等は別途工事です。' }));

    // 内訳明細（2ページ目）
    var det = h('div', { class: 'pagebreak' }, [h('h3', { text: 'オプション内訳明細' })]);
    var dt = h('tbody');
    function drow(a, b, c, d, e2) { dt.appendChild(h('tr', {}, [h('td', { text: a }), h('td', { text: b }), h('td', { class: 'num', text: c }), h('td', { class: 'num', text: d }), h('td', { class: 'num', text: e2 })])); }
    function dgrp(t) { dt.appendChild(h('tr', { class: 'grp' }, [h('td', { colspan: 5, text: t })])); }
    if (R.c.sash.has) {
      dgrp('金属製建具（標準 ' + yen(R.c.sash.std.sell) + ' との差額 ' + signedYen(R.c.sash.opSell) + '）');
      R.c.sash.lines.forEach(function (x) { var l = x.line; drow((l.sym || '') + ' ' + (l.room || ''), sashName(x.item) + ' ' + x.item.size + (l.glass === 'frost' ? ' フロスト' : '') + (l.order ? ' オーダー' : '') + (l.rac ? ' 樹脂アングル' : ''), x.qty, yen(x.unitSell), yen(x.sell)); });
    }
    if (R.c.door.has) {
      dgrp('既製建具（標準 ' + yen(R.c.door.std.sell) + ' との差額 ' + signedYen(R.c.door.opSell) + '）');
      R.c.door.lines.forEach(function (x) { var l = x.line; drow((l.sym || '') + ' ' + (l.room || ''), x.item.type + ' ' + (x.item.w ? num(x.item.w) + '×' + num(x.item.h) : '') + (l.design ? ' ' + l.design : '') + (l.lock ? ' ' + l.lock : '') + (l.special ? ' 特寸' : ''), x.qty, yen(x.qty ? x.sell / x.qty : 0), yen(x.sell)); });
      drow('', '取付調整費', 1, '', yen(R.c.door.install.sell));
    }
    if (R.c.zosaku.lines.length) {
      dgrp('造作建具');
      R.c.zosaku.lines.forEach(function (x) { drow(x.item.sym, x.item.type + ' ' + x.item.spec, x.qty, yen(x.unitSell), yen(x.sell)); });
      if (R.c.zosaku.install) drow('', R.c.zosaku.install.label, 1, '', yen(R.c.zosaku.install.sell));
    }
    var el = R.c.elec.lines.filter(function (x) { return x.delta; });
    if (el.length) { dgrp('電気工事 変更'); el.forEach(function (x) { drow('', x.item.name + (x.item.sub ? ' ' + x.item.sub : ''), (x.delta > 0 ? '+' : '') + x.delta, yen(x.unitSell), yen(x.sell)); }); }
    var pl = R.c.plumb.lines.filter(function (x) { return x.delta; });
    if (pl.length) { dgrp('給排水 変更'); pl.forEach(function (x) { drow('', x.item.name, (x.delta > 0 ? '+' : '') + x.delta, yen(x.unitSell), yen(x.sell)); }); }
    var ops = R.lines.filter(function (l) { return l.item.tag === 'OP' && l.sell && !l.virtual; });
    if (ops.length) { dgrp('その他オプション（単価表より）'); ops.forEach(function (l) { drow('', (l.item.name || '') + (l.item.spec ? ' ' + l.item.spec : ''), l.item.h === '式' ? 1 : num(l.qty, 2), '', yen(l.sell)); }); }
    if (P.extras.length) { dgrp('その他追加工事'); P.extras.forEach(function (x) { drow('', (x.name || '') + (x.spec ? ' ' + x.spec : ''), x.qty, yen(x.sell), yen(n(x.sell) * n(x.qty))); }); }
    if (dt.children.length) {
      det.appendChild(h('table', {}, [h('thead', {}, [h('tr', {}, ['符号・部屋', '品目', '数量', '単価', '金額（税抜）'].map(function (t) { return h('th', { text: t }); }))]), dt]));
      sheet.appendChild(det);
    }
    main.appendChild(sheet);

    // 社内用
    main.appendChild(card('社内用：原価と粗利', '印刷されません', [h('div', { class: 'stack' }, [
      h('div', { class: 'diffbar' }, [
        h('div', {}, [h('span', { class: 'lbl', text: '税抜売上' }), h('strong', { text: yen(e.totalEx) })]),
        h('div', {}, [h('span', { class: 'lbl', text: '原価合計' }), h('strong', { text: yen(e.cost) })]),
        h('div', {}, [h('span', { class: 'lbl', text: '粗利（率）' }), h('strong', { class: e.margin < 0.3 ? 'plus' : '', text: yen(e.profit) + '（' + (e.margin * 100).toFixed(1) + '%）' })])
      ]),
      h('p', { class: 'note', text: '積算合計（標準＋OP＋付帯＋諸経費＋設計）：' + yen(e.sekisan) + '　／　見積合計（税抜）との差：' + signedYen(e.totalEx - e.sekisan) + '　／　税抜坪単価：' + yen(e.perTsubo) }),
      secTable()
    ])], 'internal no-print'));
  }
  function secTable() {
    var tb = h('tbody');
    Object.keys(R.secTotals).forEach(function (k) {
      var s = R.secTotals[k]; if (!s.sell && !s.cost) return;
      tb.appendChild(h('tr', {}, [h('td', {}, [h('span', { class: 'tag', text: s.tag || '' })]), h('td', { text: k }), h('td', { class: 'num', text: yen(s.sell) }), h('td', { class: 'num', text: yen(s.cost) }), h('td', { class: 'num', text: s.sell ? ((1 - s.cost / s.sell) * 100).toFixed(1) + '%' : '—' })]));
    });
    return h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['区分', '工種', '積算売価', '原価', '粗利率'].map(function (t, i) { return h('th', { class: i > 1 ? 'num' : null, text: t }); }))]), tb])]);
  }
  function copyTsv() {
    var lines = [['No', '名称', '仕様', '数量', '単位', '単価', '金額'].join('\t')], no = 0;
    estimateRows(R).forEach(function (r) {
      if (r.grp) lines.push(r.grp);
      else if (r.sub) lines.push([++no, r.sub].join('\t'));
      else if (r.total || r.grand) lines.push(['', r.total || r.grand, '', '', '', '', Math.round(r.amount)].join('\t'));
      else lines.push([++no, r.name, r.spec || '', r.qty != null ? r.qty : '', r.unit || '', r.price || '', Math.round(r.amount)].join('\t'));
    });
    copyText(lines.join('\n'), '見積書をコピーしました。Excelに貼り付けできます');
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = h('textarea', { class: 'inp', style: 'min-height:160px', 'aria-label': 'コピー用テキスト' }); ta.value = text;
      var main = document.getElementById('main'); main.insertBefore(card('コピー用テキスト', '自動コピーできなかったので、選択してコピーしてください', [ta]), main.firstChild);
      ta.focus(); ta.select();
    }
    try { navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback); } catch (e) { fallback(); }
  }

  // ------------------------------------------------------------------ 10. 積算明細
  function renderDetail(main) {
    main.appendChild(pageHead('積算明細（契約内訳）', 'Excelの「契約内訳」と同じ行構成です。数量・原価単価を上書きすると黄色になり、自動計算より優先されます。', [
      h('button', { type: 'button', class: 'btn', onclick: function () { P.overrides = {}; commit(); toast('上書きをすべて解除しました'); } }, ['上書きをすべて解除'])
    ]));
    var tags = [{ v: 'all', l: 'すべて' }, { v: '基', l: '標準（本体）' }, { v: 'OP', l: 'オプション' }, { v: '付帯', l: '付帯' }, { v: '諸', l: '諸経費' }, { v: '設計', l: '設計・申請' }];
    var search = h('input', { class: 'inp search', type: 'search', id: 'detailSearch', placeholder: '名称で絞込み', value: ui.detailSearch });
    search.addEventListener('input', function () { ui.detailSearch = search.value; drawTable(); });
    var onlyId = 'detailOnly';
    var only = h('input', { type: 'checkbox', id: onlyId, checked: ui.detailOnlyQty || null });
    only.addEventListener('change', function () { ui.detailOnlyQty = only.checked; drawTable(); });
    main.appendChild(h('div', { class: 'card-row' }, [
      h('div', { class: 'seg' }, tags.map(function (t) { return h('button', { type: 'button', class: 'chip', 'aria-pressed': ui.detailTag === t.v ? 'true' : 'false', onclick: function () { ui.detailTag = t.v; renderMain(); } }, [t.l, h('span', { class: 'badge', text: t.v === 'all' ? '' : yen((R.byTag[t.v] || {}).sell || 0) })]); })),
      h('div', { class: 'seg' }, [search, h('label', { class: 'toggle', for: onlyId }, [only, h('span', { text: '金額のある行だけ' })])])
    ]));
    var wrap = h('div', { class: 'tbl-wrap' });
    main.appendChild(wrap);
    function drawTable() {
      LIVE = LIVE.filter(function (x) { return document.body.contains(x[0]); });
      wrap.innerHTML = '';
      var tb = h('tbody'), lastSec = '';
      R.lines.forEach(function (l) {
        var it = l.item;
        if (ui.detailTag !== 'all' && it.tag !== ui.detailTag) return;
        if (ui.detailOnlyQty && !l.sell && !l.cost && !l.overridden) return;
        if (ui.detailSearch && ((it.name || '') + (it.spec || '')).indexOf(ui.detailSearch) < 0) return;
        var rule = E.RULES[l.row] || {};
        if (rule.skip && !l.virtual) return;
        if (it.sec !== lastSec) { tb.appendChild(h('tr', { class: 'sec-row' }, [h('td', { colspan: 8, text: it.sec })])); lastSec = it.sec; }
        var editable = !l.virtual;
        var o = P.overrides[l.row] || {};
        var qIn = null, pIn = null;
        if (editable) {
          qIn = h('input', { class: 'inp num tiny', inputmode: 'decimal', value: o.qty == null ? '' : o.qty, placeholder: String(Math.round(l.qty * 100) / 100), 'aria-label': '数量' });
          qIn.addEventListener('change', function () { var ov = P.overrides[l.row] || (P.overrides[l.row] = {}); ov.qty = qIn.value === '' ? '' : +qIn.value; R = E.evaluate(P); drawTable(); renderSummary(); saveSoon(); });
          pIn = h('input', { class: 'inp num tiny', inputmode: 'decimal', value: o.price == null ? '' : o.price, placeholder: String(Math.round(l.price * 100) / 100), 'aria-label': '原価単価' });
          pIn.addEventListener('change', function () { var ov = P.overrides[l.row] || (P.overrides[l.row] = {}); ov.price = pIn.value === '' ? '' : +pIn.value; R = E.evaluate(P); drawTable(); renderSummary(); saveSoon(); });
        }
        tb.appendChild(h('tr', { class: l.overridden ? 'ov' : null }, [
          h('td', { class: 'num muted', text: String(l.row) }),
          h('td', {}, [h('strong', { text: it.name || '' }), it.spec ? h('div', { class: 'muted', style: 'font-size:11.5px', text: it.spec }) : null]),
          h('td', {}, [editable ? qIn : h('span', { class: 'num', text: '1' })]),
          h('td', { text: it.unit || it.h || '' }),
          h('td', {}, [editable ? pIn : h('span', { class: 'muted', text: '自動' })]),
          h('td', { class: 'num', text: l.sellUnit ? yen(l.sellUnit) : '' }),
          h('td', { class: 'num', text: yen(l.sell) }),
          h('td', { class: 'num muted', text: yen(l.cost) })
        ]));
      });
      if (!tb.children.length) tb.appendChild(h('tr', {}, [h('td', { colspan: 8, class: 'empty', text: '該当する行がありません' })]));
      wrap.appendChild(h('table', { class: 'tbl' }, [h('thead', {}, [h('tr', {}, ['行', '名称・仕様', '数量', '単位', '原価単価', '計上単価', '売価', '原価'].map(function (t, i) { return h('th', { class: [0, 5, 6, 7].indexOf(i) >= 0 ? 'num' : null, text: t }); }))]), tb]));
    }
    drawTable();
    main.appendChild(h('p', { class: 'note', text: '単価マスタ：' + D.meta.source + '（' + D.meta.extractedAt + ' 抽出）。Excelで単価を改定したら tools/extract_master.py を再実行してください。' }));
  }

  // ------------------------------------------------------------------ サマリー
  function renderSummary() {
    var e = R.est;
    document.getElementById('topTotal').textContent = yen(e.total);
    document.getElementById('mobTotal').textContent = yen(e.total);
    var box = document.getElementById('summary'); box.innerHTML = '';
    box.appendChild(h('div', { class: 'sum-card' }, [
      h('h3', { text: '契約金額（税込）' }),
      h('div', { class: 'sum-total', text: yen(e.total) }),
      h('div', { class: 'sum-lines' }, [
        h('span', { class: 'k', text: 'Ａ 建築本体＋付帯' }), h('span', { class: 'v', text: yen(e.A.ex) }),
        h('span', { class: 'k', text: '　うち本体（' + num(R.v.sekouT, 2) + '坪）' }), h('span', { class: 'v', text: yen(e.A.honTai) }),
        h('span', { class: 'k', text: 'Ｂ 申請費用他' }), h('span', { class: 'v', text: yen(e.B.ex) }),
        h('span', { class: 'k', text: 'Ｃ オプション' }), h('span', { class: 'v', text: yen(e.C.ex) }),
        h('span', { class: 'k', text: '消費税' }), h('span', { class: 'v', text: yen(e.tax) }),
        h('span', { class: 'sep' }),
        h('span', { class: 'k', text: '坪単価（本体）' }), h('span', { class: 'v', text: yen(e.A.tsubo) }),
        h('span', { class: 'k', text: '総額÷施工坪（税抜）' }), h('span', { class: 'v', text: yen(e.perTsubo) })
      ])
    ]));
    var ops = e.C.lines.filter(function (l) { return l.sell; });
    box.appendChild(h('div', { class: 'sum-card' }, [
      h('h3', { text: 'オプション内訳' }),
      ops.length ? h('div', { class: 'oplist' }, [].concat.apply([], ops.map(function (l) { return [h('span', { text: l.name.replace(' 変更差額', '') }), h('span', { class: 'v ' + cls(l.sell), text: signedYen(l.sell) })]; })))
        : h('p', { class: 'note', text: 'まだありません' })
    ]));
    var cb = h('input', { type: 'checkbox', id: 'showInternal', checked: showInternal || null });
    cb.addEventListener('change', function () { showInternal = cb.checked; store(INTERNAL_KEY, showInternal ? '1' : '0'); renderSummary(); });
    var inner = [h('label', { class: 'toggle', for: 'showInternal' }, [cb, h('span', { text: '社内情報（原価・粗利）を表示' })])];
    if (showInternal) {
      var pct = Math.max(0, Math.min(1, e.margin));
      inner.push(h('div', { class: 'sum-lines' }, [
        h('span', { class: 'k', text: '原価' }), h('span', { class: 'v', text: yen(e.cost) }),
        h('span', { class: 'k', text: '粗利' }), h('span', { class: 'v', text: yen(e.profit) }),
        h('span', { class: 'k', text: '粗利率' }), h('span', { class: 'v', text: (e.margin * 100).toFixed(1) + '%' })
      ]));
      inner.push(h('div', { class: 'meter' + (e.margin < 0.3 ? ' low' : ''), role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct * 100), 'aria-label': '粗利率' }, [h('span', { style: 'width:' + (pct * 100) + '%' })]));
      inner.push(h('p', { class: 'note', text: '原価率 ' + Math.round(R.v.genka * 1000) / 10 + '% 設定（目標粗利 ' + Math.round((1 - R.v.genka) * 1000) / 10 + '%）' }));
    }
    box.appendChild(h('div', { class: 'sum-card' }, inner));
  }

  // ------------------------------------------------------------------ サンプル・新規・保存
  function sampleProject() {
    var p = E.newProject();
    p.info.client = 'サンプル'; p.info.name = 'サンプル邸 新築工事'; p.info.site = '白山市'; p.info.city = '白山市';
    p.spec = 'フジタ'; p.floors = '2階建'; p.taishin = 3;
    p.area = { kenchiku: 72.87, f1: 67.9, f1NoFloor: 3.31, tatami: 7.45, tatamiType: '大壁', f2: 49.68, f2NoFloor: 3.31, porch: 3.0, fuki1: '', fuki2: '', jogai: '' };
    p.len.kiso = 38.2; p.len.shikichi = 72;
    p.q.gaiheki = 232; p.q.nokiDe = 12; p.q.porchNoRoof = 2;
    p.q.roof1 = { area: 62, karakusa: 18, tani: '', mune: 9, yukidome: 18 };
    p.q.roof2 = { area: 28, karakusa: 16, tani: '', mune: '', yukidome: 16 };
    p.q.toi = { noki: 34, shusui: 4, tate: 22, hai: 2 };
    p.q.tile = 3.3; p.q.tileRise = 2; p.q.agarigamachiLen = 1.8; p.q.agarigamachiCnt = 1;
    var tmp = E.evaluate(p);
    p.sash = tmp.c.sash.std.lines.map(function (l) {
      return { id: newId(), row: l.row, glass: l.frost ? 'frost' : 'clear', order: false, rac: false, qty: l.qty, sym: (l.item.label || '').replace(/\(.*\)/, ''), room: '' };
    });
    var rooms = ['玄関', 'LDK', '寝室', '洋室1', '洋室2', '洗面', 'LDK'];
    p.sash.forEach(function (l, i) { l.room = rooms[i] || ''; });
    p.sash.push({ id: newId(), row: 51, glass: 'clear', order: false, rac: false, qty: 2, sym: 'AW08', room: '階段' });   // FIX 03613
    p.sash.push({ id: newId(), row: 165, glass: 'frost', order: false, rac: false, qty: 1, sym: 'AW09', room: 'トイレ' }); // 横すべり出し 06907
    p.doors = tmp.c.door.std.lines.map(function (l) { return { id: newId(), row: l.row, qty: l.qty, design: l.item.design, lock: l.item.lock, special: false, sym: l.item.code, room: '' }; });
    p.shelves = [{ id: newId(), row: 7, qty: 3, side: 0, room: '各居室' }, { id: newId(), row: 9, qty: 1, side: 0, room: 'WIC' }, { id: newId(), row: 7, qty: 1, side: 0, room: 'ホール' }];
    p.elec = { F: 3, P: 2 };
    p.est.discountC = 0;
    return p;
  }

  var newArmed = false;
  document.getElementById('btnNew').addEventListener('click', function (ev) {
    var b = ev.currentTarget;
    if (!newArmed) { newArmed = true; b.textContent = 'もう一度押すと新規'; setTimeout(function () { newArmed = false; b.textContent = '新規'; }, 3000); return; }
    newArmed = false; b.textContent = '新規';
    P = E.newProject(); commit(); go('basic'); toast('新しい見積を始めました');
  });
  document.getElementById('btnSample').addEventListener('click', function () { P = sampleProject(); commit(); toast('サンプルを読み込みました'); });
  document.getElementById('fileImport').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () { try { P = migrate(JSON.parse(fr.result)); commit(); toast('「' + f.name + '」を読み込みました'); } catch (err) { toast('読み込めませんでした：JSON形式の見積データを選んでください'); } };
    fr.readAsText(f); e.target.value = '';
  });
  document.getElementById('btnExport').addEventListener('click', function () {
    var json = JSON.stringify(P, null, 1);
    var name = '見積_' + (P.info.client || '無題') + '_' + (P.info.date || '') + '.json';
    if (IN_FRAME) { copyText(json, '見積データをコピーしました（テキストとして保存してください）'); return; }
    var a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(name + ' を保存しました');
  });
  document.getElementById('mobEstimate').addEventListener('click', function () { go('estimate'); });
  if (IN_FRAME) document.getElementById('btnExport').textContent = 'データをコピー';

  function syncTopH() { var t = document.querySelector('.topbar'); if (t) document.documentElement.style.setProperty('--top-h', t.offsetHeight + 'px'); }
  window.addEventListener('resize', syncTopH);
  syncTopH();
  commit();
})();
