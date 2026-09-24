/*
 * 住宅見積 積算エンジン
 *
 * 見積Excel（入力用 → 各工種シート → 契約内訳 → 見積書）の計算を JavaScript に移植したもの。
 * 単価・掛率・端数桁は master-data.js（Excel から自動抽出）を参照し、
 * このファイルには「数量の出し方」と「集計の仕方」だけを書く。
 *
 * 行番号(row)は Excel「契約内訳」シートの行番号。Excel と突き合わせやすいようにそのまま使う。
 */
(function (global) {
  'use strict';

  var D = (typeof MASTER_DATA !== 'undefined') ? MASTER_DATA
    : (typeof require === 'function' ? require('./master-data.js') : null);
  if (!D) { global.Engine = null; return; }   // 単価マスタ未生成（README参照）

  // ------------------------------------------------------------------ 端数処理（Excel互換）
  function clean(x) { return Math.round(x * 1e9) / 1e9; }
  // Excel ROUNDUP: 0 から遠ざかる方向
  function roundUp(x, d) {
    x = +x || 0;
    if (!x) return 0;
    var s = x < 0 ? -1 : 1, a = clean(Math.abs(x)), f;
    if (d >= 0) { f = Math.pow(10, d); return s * Math.ceil(clean(a * f)) / f; }
    f = Math.pow(10, -d); return s * Math.ceil(clean(a / f)) * f;
  }
  // Excel ROUNDDOWN: 0 に近づく方向
  function roundDown(x, d) {
    x = +x || 0;
    if (!x) return 0;
    var s = x < 0 ? -1 : 1, a = clean(Math.abs(x)), f;
    if (d >= 0) { f = Math.pow(10, d); return s * Math.floor(clean(a * f)) / f; }
    f = Math.pow(10, -d); return s * Math.floor(clean(a / f)) * f;
  }
  function n(x) { if (x === '' || x == null) return 0; var v = +x; return isFinite(v) ? v : 0; }
  function tsubo(m2) { return roundDown(n(m2) * 0.3025, 2); }
  function sum(arr, fn) { var t = 0; for (var i = 0; i < arr.length; i++) t += fn ? fn(arr[i], i) : arr[i]; return t; }
  function byRow(list) { var m = {}; list.forEach(function (it) { m[it.row] = it; }); return m; }

  var KOUJI = byRow(D.kouji);
  var SASH = byRow(D.sash);
  var DOORS = byRow(D.doors);
  var ZOSAKU = byRow(D.zosaku);
  var SHELVES = byRow(D.shelves);
  var KADOU = byRow(D.kadou.items);
  var DAIKU = D.daiku;
  var X = D.koujiExtra;

  function dk(row) { var r = DAIKU[row]; return r && r.price != null ? r.price : 0; }

  // ------------------------------------------------------------------ 新規プロジェクト（入力の既定値）
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function newProject() {
    return {
      version: 1,
      info: { date: today(), client: '', site: '', name: '', staff: '', city: '白山市', memo: '', company: '' },
      kubun: '通常',            // 見積区分：通常/簡易/紹介/紹介簡易 → 原価率
      genkaOverride: '',        // 原価率の手入力(%)
      setsubiOverride: '',      // 住設原価率の手入力(%)
      spec: 'フジタ',           // 建物仕様：フジタ/PG/STO
      floors: '2階建',          // 平屋/2階建
      taishin: 3,               // 耐震等級
      snow: '',                 // 積雪(m)
      area: {                   // ㎡
        kenchiku: '', f1: '', f1NoFloor: '', tatami: '', tatamiType: '',
        f2: '', f2NoFloor: '', porch: '', fuki1: '', fuki2: '', jogai: ''
      },
      len: {                    // m
        kiso: '', shikichi: '', kasa1: '', nokasa1: '', kasa2: '', nokasa2: '', parapet: ''
      },
      q: {                      // 各種数量（入力用②・契約内訳の手入力セル）
        gaiheki: '', corner: '', takaKiso: '', agarigamachiCnt: '', agarigamachiLen: '',
        nokiDe: '', nokiSagari: '', noki600: '', koshikabe: '', counterCnt: '', getabakoCnt: '',
        nijuyuka: '', porchNoRoof: '', gaibuW: '', gaibuD: '',
        naibuAshiba: '', shinkabeGoban: '', daikuYobi: '',
        cf1: '', cf2: '', choshaku1: '', choshaku2: '', carpet1: '', carpet2: '',
        kyoshitsu: '', hikyoshitsu: '', register: '',
        lightDLout: '', lightDLin: '', lightCL: '',
        kdamperWallM: '',
        habaki: 130, mawaribuchi: 50, habakiCorner: 40, tesuriEnd: '', nokisakiKanki: '',
        roof1: { area: '', karakusa: '', tani: '', mune: '', yukidome: '' },
        roof2: { area: '', karakusa: '', tani: '', mune: '', yukidome: '' },
        toi: { noki: '', shusui: '', tate: '', hai: '' },
        tile: '', tileRise: '',
        kawaraHana: '', kawaraNobori: '',
        crossGate: 2, careNet: '',
        haisuiLen: 6
      },
      f: {                      // 〇フラグ
        hou22: false, tatekae: false, oyaneKawara: false, geyaKawara: false, gaihekiOther: false,
        toiUni: false, dai1: false, kdamper: false, jichinsai: false, kusakari: false,
        pole: false, toilet2F: false, tearaiBranch: false, tearaiSep: false, hems: false,
        kakunin: true, seinou: true, bels: true, choki: true, kashi: true
      },
      kakuninCost: D.input.kakuninCost || '',
      fukitsuke: 467,           // 吹付断熱の採用行（466〜469）
      yukashita: 75,            // 床下断熱厚
      nokitenColor: '濃',       // 軒天AEP 淡/濃
      gaibuColor: '淡',
      counter: '',              // キッチンカウンター '', 1700, 2600
      elecKubun: '標準',
      // ---- 商品選択（ポチポチ部分）
      sash: [],                 // {id,row,glass,order,rac,qty,sym,room}
      doors: [],                // {id,row,qty,design,lock,special,sym,room}
      zosaku: [],               // {id,row,qty,sym,room}
      zosakuInstallAuto: true,
      shelves: [],              // {id,row,qty,side,room}
      kadou: { places: '', lines: [] },
      elec: {},                 // 列 → 増減数
      plumb: {},                // 列 → 増減数
      extras: [],               // 自由入力OP {id,cat,name,spec,qty,unit,sell,cost}
      overrides: {},            // 契約内訳 行 → {qty, price}
      est: {                    // 見積書
        tsubo: '',              // 採用坪単価（空欄なら自動）
        tsuboRound: -2,
        designUnit: 40000, shinsei: 200000, shokeihiAdj: 0,
        discountA: 0, discountB: 0, discountC: 0,
        futai: {
          chosa: 100000, jiban: 100000, kansen: 75000, haisui: 780000, jigyo: 300000,
          kasetsu: 360000, zousei: '', chiiki: '', solar: '', jokaso: '', gas: ''
        }
      }
    };
  }

  // ------------------------------------------------------------------ 原価率
  function genkaRate(p) {
    var ov = n(p.genkaOverride);
    if (ov) return ov / 100;
    return (D.input.kubunRate[p.kubun] || D.input.kubunRate['通常']) / 100;
  }
  function setsubiRate(p) {
    var ov = n(p.setsubiOverride);
    if (ov) return ov / 100;
    return genkaRate(p);
  }

  // ------------------------------------------------------------------ 面積・名前付き値（入力用シート相当）
  function derive(p) {
    var a = p.area, L = p.len, q = p.q;
    var v = { p: p, spec: p.spec, floors: p.floors };
    v.isPG = p.spec === 'PG';
    v.isSTO = p.spec === 'STO';
    v.isFujita = p.spec === 'フジタ';
    v.kani = String(p.kubun || '').indexOf('簡易') >= 0;
    v.kenchiku = n(a.kenchiku); v.kenchikuT = tsubo(v.kenchiku);            // 建築 / 建築坪
    v.f1 = n(a.f1); v.f1T = tsubo(v.f1);                                     // 1F床面積
    v.f1No = n(a.f1NoFloor); v.porchInT = tsubo(v.f1No);                     // うち床無し(玄関UB車庫等) = ポーチ坪
    v.ichiF = v.f1 - v.f1No; v.ichiFT = tsubo(v.ichiF);                      // 一階床 / 一階床坪
    v.tatami = n(a.tatami); v.tatamiT = tsubo(v.tatami);                     // 畳 / 畳坪
    v.niF = n(a.f2); v.niFT = tsubo(v.niF);                                  // 二階床 / 二階床坪
    v.kaidan = n(a.f2NoFloor);                                               // 階段
    v.nobe = v.f1 + v.niF; v.nobeT = roundDown(v.f1T + v.niFT, 2);           // 延床 / 延床坪
    v.porch = n(a.porch); v.porchT = tsubo(v.porch);                         // 非対象ポ / 非対象ポ坪
    v.fuki = n(a.fuki1); v.fukiT = tsubo(v.fuki);                            // 吹抜
    v.fuki2 = n(a.fuki2); v.fuki2T = tsubo(v.fuki2);                         // 吹抜②
    v.sekou = v.nobe + v.porch + v.fuki; v.sekouT = tsubo(v.sekou);          // 施工 / 施工床坪
    v.geya = p.floors === '平屋' ? 0 : v.kenchiku - v.niF; v.geyaT = tsubo(v.geya); // 下屋
    var jogai = n(a.jogai);
    v.dannetsu = (jogai ? v.nobe - jogai : v.nobe) + v.fuki; v.dannetsuT = tsubo(v.dannetsu);
    v.yukaAriT = roundDown(v.ichiFT + v.niFT, 2);                           // J18 床有り全体
    v.potoT = roundDown(v.porchInT + v.porchT, 2);                           // J19 ポ等坪
    v.fukiAllT = roundDown(v.fukiT + v.fuki2T, 2);                           // J20 吹抜全体
    v.kiso = n(L.kiso); v.shikichi = n(L.shikichi);
    v.mekakushiL = n(L.kasa1) + n(L.nokasa1) + n(L.kasa2) + n(L.nokasa2);     // 目隠L
    v.paraL = n(L.parapet);                                                  // パラL
    v.kasagiL = n(L.kasa1) + n(L.kasa2) + v.paraL;                           // 笠木
    v.gaiheki = n(q.gaiheki);                                                // 外壁面積(実面積)
    v.cf = n(q.cf1) + n(q.cf2); v.choshaku = n(q.choshaku1) + n(q.choshaku2); v.carpet = n(q.carpet1) + n(q.carpet2);
    v.q = q; v.f = p.f;
    v.genka = genkaRate(p); v.setsubi = setsubiRate(p);
    return v;
  }

  // ------------------------------------------------------------------ ②サッシ
  var SASH_NOT_COUNT = /水切|方立|無目|10set/;
  function sashCosts(it) {
    var K = n(it.list) * n(it.rate) + n(it.screen) * n(it.rateS) + n(it.other) + (it.list ? n(it.extra) : 0);
    var Lf = it.listF ? n(it.listF) * n(it.rateF) + n(it.screen) * n(it.rateS) + n(it.other) : null;
    return { K: K, L: Lf, M: n(it.madodai), N: n(it.daiku), O: n(it.angle), R: n(it.order) || 1 };
  }
  function sashLine(line, genka) {
    var it = SASH[line.row];
    if (!it) return null;
    var c = sashCosts(it), qty = n(line.qty);
    var frost = line.glass === 'frost' && c.L != null;
    var base = frost ? c.L : c.K;
    var raw = (base * (line.order ? c.R : 1) + c.M) * qty + (line.rac ? c.O * qty : 0);
    var cost = roundDown(raw, 0);
    var sell = roundUp(cost / genka + c.N * qty / genka, -2);
    return { item: it, qty: qty, cost: cost, sell: sell, unitSell: qty ? sell / qty : 0, counts: !SASH_NOT_COUNT.test(it.type) };
  }
  function sashStd(v) {
    var key = v.isPG ? 'PG' : 'normal', lines = [];
    D.sash.forEach(function (it) {
      if (!it.std || !it.std[key]) return;
      var s = it.std[key], c = sashCosts(it);
      var nC = n(s.clear), nF = n(s.frost), nR = n(s.rac);
      var cost = roundDown((c.K + c.M) * nC + ((c.L || 0) + c.M) * nF + c.O * nR, 0);
      var S = it.list ? roundUp((c.K + c.M + c.N) / v.genka, -2) : 0;
      var T = c.L != null ? roundUp((c.L + c.M + c.N) / v.genka, -2) : 0;
      var U = roundUp(c.O / v.genka, -2);
      lines.push({ item: it, row: it.row, qty: nC + nF, clear: nC, frost: nF, rac: nR,
        cost: cost, sell: S * nC + T * nF + U * nR, counts: !SASH_NOT_COUNT.test(it.type) });
    });
    return {
      lines: lines,
      cost: sum(lines, function (l) { return l.cost; }),
      sell: sum(lines, function (l) { return l.sell; }),
      count: sum(lines, function (l) { return l.counts ? l.qty : 0; })
    };
  }
  function sashCalc(v) {
    var std = sashStd(v);
    var lines = (v.p.sash || []).map(function (l) { var r = sashLine(l, v.genka); if (r) r.line = l; return r; }).filter(Boolean);
    var has = lines.length > 0 && sum(lines, function (l) { return l.cost; }) !== 0;
    var cSell = sum(lines, function (l) { return l.sell; }), cCost = sum(lines, function (l) { return l.cost; });
    var count = sum(lines, function (l) { return l.counts ? l.qty : 0; });
    return {
      std: std, lines: lines, has: has, sell: cSell, cost: cCost, count: count,
      opSell: has ? cSell - std.sell : 0, opCost: has ? cCost - std.cost : 0
    };
  }

  // ------------------------------------------------------------------ ③既製建具
  function doorDesignList(code) {
    if (!code) return 0;
    for (var i = 0; i < D.doorDesigns.length; i++) if (D.doorDesigns[i].code === code) return n(D.doorDesigns[i].list);
    return 0;
  }
  function doorLockList(code) {
    if (!code) return 0;
    for (var i = 0; i < D.doorLocks.length; i++) if (D.doorLocks[i].code === code) return n(D.doorLocks[i].list);
    return 0;
  }
  function doorUnitCost(it, line) {
    var net = n(D.doorNet.base), over = n(D.doorNet.over) || 1;
    var design = line.design != null ? line.design : it.design;
    var lock = line.lock != null ? line.lock : it.lock;
    // 標準仕様のまま（デザイン・錠が標準どおり）なら Excel の標準原価をそのまま使う
    if (it.stdCost && design === it.design && lock === it.lock && !line.special) return n(it.stdCost);
    var c = it.cost != null ? n(it.cost)
      : (n(it.L != null ? it.L : it.list) + n(it.handle) + n(it.closer)) * n(it.leaves) * net + n(it.frameP) * net;
    c += doorDesignList(design) * net * n(it.leaves) * (line.special ? over : 1);
    c += doorLockList(lock) * net;
    if (line.special) c += (n(it.L != null ? it.L : it.list) * n(it.leaves) + n(it.frameP)) * net * (over - 1);
    return c;
  }
  function doorCalc(v) {
    var key = v.isPG ? 'PG' : 'normal';
    var instCost = n(D.doorInstall.cost) || 25000;
    var instSell = roundUp(instCost / v.genka, -2);
    var stdLines = [];
    D.doors.forEach(function (it) {
      if (!it.std || !it.std[key]) return;
      var qty = n(it.std[key]);
      var unit = v.isPG ? n(it.cost) : n(it.stdCost);
      stdLines.push({ item: it, row: it.row, qty: qty, unitCost: unit, cost: unit * qty,
        sell: roundUp((unit + n(it.daiku)) / v.genka, -2) * qty });
    });
    var std = {
      lines: stdLines,
      cost: sum(stdLines, function (l) { return l.cost; }) + (stdLines.length ? instCost : 0),
      sell: sum(stdLines, function (l) { return l.sell; }) + (stdLines.length ? instSell : 0),
      // Excel の既製標準台数は取付費の行も 1 と数える（V239）。大工標準手間に効くので踏襲
      count: sum(stdLines, function (l) { return l.qty; }) + (stdLines.length ? 1 : 0)
    };
    var lines = (v.p.doors || []).map(function (l) {
      var it = DOORS[l.row]; if (!it) return null;
      var qty = n(l.qty), unit = doorUnitCost(it, l);
      return { line: l, item: it, qty: qty, unitCost: unit, cost: unit * qty,
        sell: roundUp((unit + n(it.daiku)) / v.genka, -2) * qty };
    }).filter(Boolean);
    var has = lines.length > 0 && sum(lines, function (l) { return l.qty; }) > 0;
    var cost = sum(lines, function (l) { return l.cost; }) + (has ? instCost : 0);
    var sell = sum(lines, function (l) { return l.sell; }) + (has ? instSell : 0);
    return {
      std: std, lines: lines, has: has, cost: cost, sell: sell, install: { cost: instCost, sell: instSell },
      count: sum(lines, function (l) { return l.qty; }),
      opSell: has ? sell - std.sell : 0, opCost: has ? cost - std.cost : 0
    };
  }

  // ------------------------------------------------------------------ ④造作建具
  function zosakuCalc(v) {
    var lines = (v.p.zosaku || []).map(function (l) {
      var it = ZOSAKU[l.row]; if (!it) return null;
      var qty = n(l.qty), unitSell = roundUp((it.cost + it.hw + it.daiku) / v.genka, -2);
      return { line: l, item: it, qty: qty, unitSell: unitSell, sell: unitSell * qty, cost: it.cost * qty };
    }).filter(Boolean);
    var count = sum(lines, function (l) { return l.qty; });
    var inst = null;
    if (v.p.zosakuInstallAuto !== false && count > 0) {
      var tiers = D.zosakuInstall, t = count <= 3 ? tiers[0] : count <= 8 ? tiers[1] : count <= 12 ? tiers[2] : null;
      inst = t ? { label: '搬入取付費（' + t.range + '）', cost: t.cost, sell: roundUp(t.cost / v.genka, -2) }
        : { label: '搬入取付費（13枚以上：別途見積）', cost: 0, sell: 0, warn: true };
    }
    var sell = sum(lines, function (l) { return l.sell; }) + (inst ? inst.sell : 0);
    var cost = sum(lines, function (l) { return l.cost; }) + (inst ? inst.cost : 0);
    return { lines: lines, count: count, install: inst, sell: sell, cost: cost };
  }

  // ------------------------------------------------------------------ ⑤固定棚
  function shelfCalc(v) {
    var stdBoard = 0, stdHw = 0, stdCount = 0;
    D.shelves.forEach(function (s) {
      stdBoard += s.board * s.std; stdHw += (s.pipe + s.hanger) * s.std; stdCount += s.std;
    });
    var lines = (v.p.shelves || []).map(function (l) {
      var s = SHELVES[l.row]; if (!s) return null;
      var qty = n(l.qty), side = n(l.side);
      var unitSell = roundUp((s.board + s.pipe + s.hanger + s.install) / v.genka, -2);
      var sideSell = roundUp(s.side / v.genka, -2);
      return { line: l, item: s, qty: qty, side: side, sell: unitSell * qty + sideSell * side,
        board: s.board * qty + s.side * side, hw: (s.pipe + s.hanger) * qty };
    }).filter(Boolean);
    var has = lines.length > 0;
    var cBoard = sum(lines, function (l) { return l.board; }), cHw = sum(lines, function (l) { return l.hw; });
    var cCount = sum(lines, function (l) { return l.qty; });
    return {
      lines: lines, has: has, std: { board: stdBoard, hw: stdHw, count: stdCount },
      sell: sum(lines, function (l) { return l.sell; }), count: cCount,
      boardDiff: has ? cBoard - stdBoard : 0, hwDiff: has ? cHw - stdHw : 0, countDiff: has ? cCount - stdCount : 0
    };
  }

  // ------------------------------------------------------------------ ⑥可動棚
  function kadouCalc(v) {
    var k = v.p.kadou || { places: '', lines: [] };
    var lines = (k.lines || []).map(function (l) {
      var it = KADOU[l.row]; if (!it) return null;
      var qty = n(l.qty), side = n(l.side);
      var unitSell = roundUp(it.cost / v.genka, -2);
      return { line: l, item: it, qty: qty, side: side,
        sell: unitSell * qty + (side ? roundUp(it.side * side / v.genka, -2) : 0),
        board: it.kind === 'board' ? it.cost * qty + it.side * side : 0,
        hw: it.kind === 'hw' ? it.cost * qty : 0 };
    }).filter(Boolean);
    var places = n(k.places);
    return {
      lines: lines, places: places,
      board: sum(lines, function (l) { return l.board; }), hw: sum(lines, function (l) { return l.hw; }),
      sell: sum(lines, function (l) { return l.sell; }) + (places ? roundUp(n(D.kadou.install) / v.genka * places, -2) : 0)
    };
  }

  // ------------------------------------------------------------------ ⑦電気 / ⑧配管（標準からの増減）
  function dai1Row(v) {
    var list = D.electric.dai1, key;
    if (v.isPG) key = v.floors === '平屋' ? 'PG平屋' : 'PG2F';
    else key = v.floors === '平屋' ? 'F1台' : 'F2台';
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[0];
  }
  function elecCalc(v) {
    var p = v.p, rooms = n(p.q.kyoshitsu), nonRooms = n(p.q.hikyoshitsu);
    var auto = { C: rooms + nonRooms, D: rooms + nonRooms, F: rooms * 2 + nonRooms, Z: rooms + nonRooms };
    var d1 = p.f.dai1 ? dai1Row(v) : null;
    var lines = D.electric.items.map(function (it) {
      var cost = it.cost;
      if (it.col === 'Y' && d1) cost = n(d1.labor);
      var manual = n((p.elec || {})[it.col]);
      var a = n(auto[it.col]);
      if (it.col === 'W' && d1) a -= it.std;      // 第一種換気 → 第三種の換気扇は減
      if (it.col === 'Y' && d1) a += 1;           // 第一種施工手間
      var delta = manual + a;
      var unitSell = roundUp(cost / v.genka, -2);
      return { item: it, std: it.std, auto: a, manual: manual, delta: delta, unitCost: cost, unitSell: unitSell,
        cost: delta * cost, sell: delta * unitSell };
    });
    return {
      lines: lines, dai1: d1,
      dai1Body: d1 && !v.isPG ? { cost: n(d1.unit), sell: roundUp(n(d1.unit) / v.genka, -2), maker: d1.maker } : null,
      sell: sum(lines, function (l) { return l.sell; }), cost: sum(lines, function (l) { return l.cost; })
    };
  }
  function plumbCalc(v) {
    var lines = D.plumbing.filter(function (it) { return it.cost; }).map(function (it) {
      var delta = n((v.p.plumb || {})[it.col]);
      var unitSell = roundDown(it.cost / v.genka, -2);    // ⑧配管は ROUNDDOWN
      return { item: it, std: it.std, delta: delta, unitCost: it.cost, unitSell: unitSell,
        cost: delta * it.cost, sell: delta * unitSell };
    });
    return { lines: lines, sell: sum(lines, function (l) { return l.sell; }), cost: sum(lines, function (l) { return l.cost; }) };
  }

  // ------------------------------------------------------------------ ①大工
  function daikuStd(v, c) {
    var q = v.q, t = 0, items = [];
    function add(row, qty, price) { var pr = price != null ? price : dk(row); var amt = n(qty) * pr; if (amt) items.push({ row: row, name: (DAIKU[row] || {}).name || (DAIKU[row] || {}).spec, qty: qty, price: pr, amount: amt }); t += amt; }
    if (!v.isPG) { add(4, v.yukaAriT); add(5, roundDown(v.potoT + v.fukiAllT, 2)); }
    else { add(6, v.yukaAriT); add(7, roundDown(v.potoT + v.fukiAllT, 2)); }
    if (v.sekouT && v.isFujita) add(8, v.gaiheki);
    add(9, v.porch);
    add(10, clean(v.ichiF + v.niF - v.kaidan - (v.cf + v.choshaku + v.tatami)));
    add(11, v.cf); add(12, v.choshaku); add(13, v.carpet);
    add(14, n(q.agarigamachiCnt));
    add(15, c.sashStdCount); add(16, c.doorStdCount); add(17, c.shelfStdCount);
    if (v.floors === '2階建') add(18, 1);
    if (v.sekouT) { add(19, 1); add(20, v.sekouT); add(21, 1); add(22, 1); }
    if (v.sekouT > 50) add(23, 1);
    if (v.isPG || v.f.kdamper) add(24, 4);
    if (v.isPG || v.isSTO || v.f.kdamper) add(25, roundUp(n(q.kdamperWallM) * 3, 1));
    if (n(q.daikuYobi)) { t += n(q.daikuYobi); items.push({ row: 26, name: '予備費', qty: 1, price: n(q.daikuYobi), amount: n(q.daikuYobi) }); }
    return { total: t, items: items };
  }
  function daikuOpOuter(v) {
    var q = v.q;
    return v.geyaT * dk(30) + (v.floors === '平屋' ? v.kenchikuT / 2 * dk(31) : 0)
      + v.mekakushiL * dk(32) + v.paraL * dk(33) + n(q.nokiDe) * dk(35) + n(q.nokiSagari) * dk(36)
      + n(q.shinkabeGoban) * dk(37);
  }
  function daikuOpInner(v) {
    // Excel(①大工 G41:G50)は内部足場(G42)も含むが、内部足場の大工手間は契約内訳685行でも計上され
    // 二重計上になるため、ここでは除外している（README参照）
    var q = v.q, p = v.p;
    return (v.f.hou22 ? dk(43) : 0)
      + (v.tatami && p.area.tatamiType === '大壁' ? v.tatamiT * dk(45) : 0)
      + (v.tatami && p.area.tatamiType === '真壁' ? v.tatamiT * dk(46) : 0)
      + n(q.koshikabe) * dk(48) + n(q.counterCnt) * dk(49) + n(q.getabakoCnt) * dk(50);
  }

  // ------------------------------------------------------------------ 契約内訳：数量・単価ルール（行番号 → 式）
  // qty(v, q, c): v=名前付き値, q(row)=他行の数量, c=商品モジュールの計算結果
  function stdIf(v, x) { return v.sekouT ? x : 0; }
  var RULES = {
    // 1 仮設工事
    106: { qty: function (v, q) { return (q(107) === 1 || q(108) === 1) ? 0 : v.nobe; } },
    109: { qty: function (v) { return stdIf(v, 4); } },
    111: { qty: function (v, q) { return q(112) === 0 ? 0 : 1; } },
    112: { qty: function (v) { return v.sekouT; } },
    116: { qty: function (v) { return v.sekouT; } },
    118: { qty: function (v) { return v.isSTO ? 1 : 0; } },
    // 2 基礎工事
    124: { qty: function (v) { return stdIf(v, v.kenchiku); } },
    125: { qty: function (v, q) { return roundUp(q(124) * 0.75, 1); } },
    127: { qty: function (v) { return stdIf(v, roundUp((n(v.p.len.kasa1) + n(v.p.len.nokasa1)) * 0.75, 0)); } },
    129: { qty: function (v) { return stdIf(v, n(v.p.len.kasa1) + n(v.p.len.nokasa1)); } },
    131: { qty: function (v, q) { return roundUp(q(125) * 0.8, 1); } },
    132: { qty: function (v) { return stdIf(v, 3); } },
    134: { qty: function (v) { return stdIf(v, v.porch + n(v.q.porchNoRoof) + 2); } },
    135: { qty: function (v) { return stdIf(v, 2); } },
    138: { qty: function (v) { return stdIf(v, roundUp(v.kenchiku * 0.22, 1)); } },
    139: { qty: function (v) { return stdIf(v, 1); } },
    140: { qty: function (v) { return stdIf(v, v.kenchiku * 0.1); } },
    // 3 木工事（構造材）
    152: { qty: function (v) { return (!v.isPG && v.floors === '平屋') ? v.sekouT - v.potoT : 0; } },
    153: { qty: function (v) { return (!v.isPG && v.floors === '2階建') ? v.sekouT - v.potoT - v.fukiT : 0; } },
    154: { qty: function (v) { return v.floors && v.isPG ? v.sekouT : 0; },
           price: function (v) { var a = X.precutPG || [0, 0]; return v.isPG && v.floors === '平屋' ? a[0] : a[1]; } },
    156: { qty: function (v) { return v.isPG ? 0 : v.potoT + v.fukiT + v.fuki2T; } },
    158: { qty: function (v) { return stdIf(v, 1); } },
    159: { qty: function (v) { return v.f.kdamper ? n(v.q.kdamperWallM) : 0; } },
    // 4 木工事（造作材）
    169: { qty: function (v) { return v.isPG ? 0 : stdIf(v, 1); } },
    170: { qty: function (v, q) { return q(169) ? 1 : 0; } },
    // 5 木工事（大工工料他）
    186: { qty: function () { return 1; }, price: function (v, c) { return v.sekouT ? c.daiku.total : 0; } },
    187: { qty: function (v) { return v.sekouT ? (v.sekouT >= 50 ? 2 : 1) : 0; } },
    // 6 建材工事
    206: { qty: function (v) { return v.porch ? roundUp(v.porch / 1.65, 0) : 0; } },
    208: { qty: function (v, q) { return q(206) ? q(206) - 1 : 0; } },
    210: { qty: function (v) { return roundUp((n(v.q.gaibuW) + n(v.q.gaibuD)) * 2 / 0.91 * 1.5, 0); } },
    211: { qty: function (v) { return roundUp((n(v.q.gaibuW) + n(v.q.gaibuD)) * 2 / 1.8, 0); } },
    213: { qty: function (v) { return stdIf(v, 6); } },
    215: { qty: function (v) { return roundUp((v.nobe - v.kaidan) / 1.65, 0); } },
    216: { qty: function (v) { return roundUp(v.sekouT * 8, 0); } },
    219: { qty: function (v) { return stdIf(v, 2); } }, 220: { qty: function (v) { return stdIf(v, 2); } },
    221: { qty: function (v) { return stdIf(v, 2); } }, 222: { qty: function (v) { return stdIf(v, 2); } },
    223: { qty: function (v) { return stdIf(v, 2); } }, 224: { qty: function (v) { return stdIf(v, 10); } },
    225: { qty: function (v) { return stdIf(v, 2); } },
    226: { qty: function (v) { var cfc = v.cf + v.choshaku; return cfc ? roundUp(cfc / 1.65 * 1.15, 0) : 0; } },
    227: { qty: function (v) { return stdIf(v, 2); } }, 228: { qty: function (v) { return stdIf(v, 2); } },
    232: { qty: function (v) { return v.floors === '2階建' ? 1 : 0; } },
    235: { qty: function (v) { return roundUp((v.nobe - (v.cf + v.choshaku + v.carpet)) / 3.305785, 0); } },
    237: { qty: function (v) { return n(v.q.agarigamachiLen); } },
    // 巾木・廻縁（Excelは241行だけ入力用!B14を参照する式になっているが、他行と同じく仕様で判定）
    241: { qty: function (v) { return v.isPG ? 0 : roundUp(n(v.q.mawaribuchi) / 2.7 / 10, 0); } },
    243: { qty: function (v) { return v.isPG ? 0 : roundUp((n(v.q.habaki) - n(v.q.mawaribuchi)) / 3.9 / 10, 0); } },
    244: { qty: function (v) { return v.isPG ? 0 : roundUp(n(v.q.habakiCorner) / 4, 0); } },
    247: { qty: function (v) { return v.isPG ? roundUp((n(v.q.habaki) - n(v.q.mawaribuchi)) / 2.7 / 10, 0) : 0; } },
    248: { qty: function (v) { return v.isPG ? roundUp(n(v.q.habakiCorner) / 4, 0) : 0; } },
    254: { qty: function (v) { return n(v.q.tesuriEnd) ? roundUp(n(v.q.tesuriEnd) / 2, 0) : 0; } },
    258: { qty: function (v) { return stdIf(v, 1); } },
    259: { qty: function (v, q) { return stdIf(v, q(226) + q(235) * 2); } },
    262: { qty: function (v) { return stdIf(v, 1); } },
    266: { qty: function (v) { return v.floors === '2階建' ? 1 : 0; } },
    268: { qty: function (v) { return stdIf(v, 1); } },
    269: { qty: function () { return 1; }, price: function (v, c) { return v.sekouT ? c.shelf.std.board : 0; } },
    272: { qty: function (v) { return (v.isPG || v.isSTO) ? 0 : stdIf(v, roundUp(v.gaiheki / 40, -1)); } },
    // 7 屋根工事（屋根面積などは手入力）
    278: { qty: function (v) { return n(v.q.roof1.area); } }, 279: { qty: function (v) { return n(v.q.roof1.karakusa); } },
    280: { qty: function (v) { return n(v.q.roof1.tani); } }, 281: { qty: function (v) { return n(v.q.roof1.mune); } },
    282: { qty: function (v) { return n(v.q.roof1.yukidome); } },
    285: { qty: function (v) { return n(v.q.roof2.area); } }, 286: { qty: function (v) { return n(v.q.roof2.karakusa); } },
    287: { qty: function (v) { return n(v.q.roof2.tani); } }, 288: { qty: function (v) { return n(v.q.roof2.mune); } },
    289: { qty: function (v) { return n(v.q.roof2.yukidome); } },
    291: { qty: function (v) { return stdIf(v, v.kasagiL); } },
    292: { qty: function (v) { return v.floors === '2階建' ? 1 : 0; } },
    293: { qty: function (v, q) { return q(278) ? 1 : 0; } },
    295: { qty: function (v) { return v.isPG ? n(v.q.nokiDe) + n(v.q.nokiSagari) : 0; } },
    // 8 雨樋
    311: { qty: function (v) { return n(v.q.toi.noki); } }, 312: { qty: function (v) { return n(v.q.toi.shusui); } },
    313: { qty: function (v) { return n(v.q.toi.tate); } }, 314: { qty: function (v) { return n(v.q.toi.hai); } },
    // 11 左官
    396: { qty: function (v) { return (v.isSTO || v.isPG) ? 0 : v.kiso; } },
    400: { qty: function (v) { return v.isSTO ? v.gaiheki : 0; } },
    402: { qty: function (v) { return (v.isPG || v.isSTO) ? v.kiso : 0; } },
    403: { qty: function (v) { return v.isPG ? 1 : 0; } },
    // 12 タイル（フジタ標準 / PG標準）
    414: { qty: function (v) { return v.isPG ? 0 : n(v.q.tile); } }, 415: { qty: function (v) { return v.isPG ? 0 : n(v.q.tileRise); } },
    416: { qty: function (v) { return v.isPG ? n(v.q.tile) : 0; } }, 417: { qty: function (v) { return v.isPG ? n(v.q.tileRise) : 0; } },
    // 13 塗装（軒天：ポーチ面積 = ケイカル枚数×1.65）
    431: { qty: function (v, q) { return nokiten(v, q, '淡', false, 206); } },
    432: { qty: function (v, q) { return nokiten(v, q, '淡', true, 206); } },
    433: { qty: function (v, q) { return nokiten(v, q, '濃', false, 206); } },
    434: { qty: function (v, q) { return nokiten(v, q, '濃', true, 206); } },
    437: { qty: function (v, q) { return v.isFujita ? (q(516) ? q(516) + q(517) + q(518) * 0.2 : 0) : 0; } },
    438: { qty: function (v, q) { return v.isFujita ? (q(522) ? q(522) + q(523) + q(524) * 0.2 : 0) : 0; } },
    439: { qty: function (v, q) { return q(279); } },
    442: { qty: function (v) { var a = gaibuArea(v); return a && v.p.gaibuColor === '淡' && a < 20 ? 1 : 0; } },
    443: { qty: function (v) { var a = gaibuArea(v); return a && v.p.gaibuColor === '淡' && a >= 20 ? a : 0; } },
    // 14 内装
    452: { qty: function (v) { return v.cf && v.cf < 2 ? 1 : 0; } }, 453: { qty: function (v) { return v.cf >= 2 ? v.cf : 0; } },
    454: { qty: function (v) { return v.choshaku && v.choshaku < 2 ? 1 : 0; } }, 455: { qty: function (v) { return v.choshaku >= 2 ? v.choshaku : 0; } },
    456: { qty: function (v) { return v.carpet; } },
    // 15 断熱（吹付は採用行のみ／床下断熱は厚み選択）
    466: { qty: function (v) { return v.p.fukitsuke === 466 ? v.dannetsuT : 0; } },
    467: { qty: function (v) { return v.p.fukitsuke === 467 ? v.dannetsuT : 0; } },
    468: { qty: function (v) { return v.p.fukitsuke === 468 ? v.dannetsuT : 0; } },
    469: { qty: function (v) { return v.p.fukitsuke === 469 ? v.dannetsuT : 0; } },
    482: { qty: function (v) { return yukaIns(v, 50); }, costMul: notPG }, 483: { qty: function (v, q) { return q(482); }, costMul: notPG },
    484: { qty: function (v, q) { return q(482) ? roundUp(q(482) * 6 / 20, 0) : 0; }, costMul: notPG },
    485: { qty: function (v) { return yukaIns(v, 75); }, costMul: notPG }, 486: { qty: function (v, q) { return q(485); }, costMul: notPG },
    487: { qty: function (v, q) { return q(485) ? roundUp(q(485) * 6 / 20, 0) : 0; }, costMul: notPG },
    488: { qty: function (v) { return yukaIns(v, 90); }, costMul: notPG }, 489: { qty: function (v, q) { return q(488); }, costMul: notPG },
    490: { qty: function (v, q) { return q(488) ? roundUp(q(488) * 6 / 16, 0) : 0; }, costMul: notPG },
    491: { qty: function (v) { return yukaIns(v, 100); }, costMul: notPG }, 492: { qty: function (v, q) { return q(491); }, costMul: notPG },
    493: { qty: function (v, q) { return q(491) ? roundUp(q(491) * 6 / 20, 0) : 0; }, costMul: notPG },
    498: { qty: function (v) { return v.isPG ? roundUp(v.ichiF / 1.65, 0) : 0; }, costMul: onlyPG },
    499: { qty: function (v, q) { return q(498); }, costMul: onlyPG },
    500: { qty: function (v, q) { return q(498) ? roundUp(q(498) * 6 / 16, 0) : 0; }, costMul: onlyPG },
    // 16 外装（サイディング単価は PG=塗装版 / その他=無塗装版、STO は計上しない）
    516: { qty: function (v) { return v.gaiheki; }, price: siding(516), mul: notSTO },
    517: { price: siding(517), mul: notSTO },
    518: { qty: function (v) { return n(v.q.corner); }, price: siding(518), mul: notSTO },
    519: { qty: function (v, q) { return q(516) + q(517); }, price: siding(519), mul: notSTO },
    520: { qty: function (v, q) { return q(516) ? 1 : 0; }, price: siding(520), mul: notSTO },
    522: { price: siding(522), mul: notSTO }, 523: { price: siding(523), mul: notSTO },
    524: { price: siding(524), mul: notSTO },
    525: { qty: function (v, q) { return q(522) + q(523); }, price: siding(525), mul: notSTO },
    526: { qty: function (v, q) { return q(522) ? 1 : 0; }, price: siding(526), mul: notSTO },
    528: { price: siding(528) }, 529: { price: siding(529) }, 530: { price: siding(530) },
    531: { qty: function (v) { return n(v.q.nokisakiKanki) ? roundUp(n(v.q.nokisakiKanki) / 2.7 / 6, 0) : 0; } },
    532: { price: siding(532) },
    533: { qty: function (v, q) { return q(291); }, price: siding(533) },
    534: { price: siding(534) },
    538: { qty: function (v, q) { return v.isPG ? nokitenArea(q).total / 1.65 * 1.1 : 0; }, mul: onlyPG },
    540: { qty: function (v) { return v.isSTO ? 1 : 0; } },
    541: { qty: function (v) { return v.isSTO ? v.gaiheki : 0; } },
    542: { qty: function (v) { return v.isSTO ? v.kiso * 0.45 : 0; } },
    547: { qty: function () { return 1; } },
    // 17 家具
    550: { qty: function (v) { return String(v.p.counter) === '1700' ? 1 : 0; } },
    551: { qty: function (v) { return String(v.p.counter) === '2600' ? 1 : 0; } },
    552: { qty: function (v) { return v.p.counter ? 1 : 0; } },
    // 18 雑工事
    567: { qty: function (v) { return stdIf(v, 1); } }, 568: { qty: function (v) { return stdIf(v, 1); } },
    569: { qty: function (v) { return stdIf(v, v.kenchiku); } },
    577: { qty: function (v) { return stdIf(v, v.nobe); }, price: function (v) { var a = X.zatsuKanamono || [0, 0]; return v.isPG ? a[0] : a[1]; } },
    578: { qty: function (v) { return stdIf(v, 1); } }, 579: { qty: function (v) { return stdIf(v, 2); } },
    581: { qty: function (v) { return stdIf(v, 1); }, price: function (v, c) { return c.shelf.std.hw; } },
    583: { qty: function (v) { return (v.f.kdamper || v.isPG) ? 4 : 0; } },
    // 19 電気
    601: { qty: function (v) { return stdIf(v, 1); }, price: function (v) { return v.sekouT ? n(X.elecBase[v.p.elecKubun || '標準'] || X.elecBase['標準']) : 0; } },
    602: { qty: function (v) { return v.isPG ? 0 : n(v.q.register); } },
    603: { qty: function (v) { return v.isPG ? -1 : 0; } },
    604: { qty: function (v) { return v.isPG ? 1 : 0; } },
    609: { qty: light(609) }, 610: { qty: light(610) }, 611: { qty: light(611) },
    612: { qty: light(612) }, 613: { qty: light(613) }, 614: { qty: light(614) },
    617: { qty: function (v) { return v.kani ? n(v.q.lightDLout) : 0; } },
    618: { qty: function (v) { return v.kani ? n(v.q.lightDLin) : 0; } },
    619: { qty: function (v) { return v.kani ? n(v.q.lightCL) : 0; } },
    624: { qty: function (v) { return n(v.q.hikyoshitsu); } },
    625: { qty: function (v) { return n(v.q.kyoshitsu); } },
    629: { qty: function (v) { return v.isPG && v.floors === '平屋' && v.f.dai1 ? 1 : 0; } },
    630: { qty: function (v) { return v.isPG && v.floors === '2階建' && v.f.dai1 ? 1 : 0; } },
    // 20 給排水・住設
    639: { qty: function (v) { return stdIf(v, 1); } },
    645: { qty: stdOne }, 646: { qty: stdOne }, 647: { qty: stdOne }, 648: { qty: stdOne },
    650: { qty: stdOne }, 651: { qty: stdOne }, 653: { qty: stdOne },
    658: { qty: function (v) { return v.f.toilet2F ? 1 : 0; } },
    667: { qty: function (v) { return v.isPG ? 0 : stdIf(v, 1); } },
    668: { qty: function (v) { return v.isPG ? stdIf(v, 1) : 0; } },
    // ---- オプション
    674: { qty: function (v) { return n(v.q.takaKiso); } },
    677: { qty: function (v) { return v.geyaT; } },
    678: { qty: function (v) { return n(v.q.nokiDe) + n(v.q.nokiSagari); } },
    679: { qty: function (v) { return n(v.q.nijuyuka); } },
    680: { qty: function (v) { return n(v.q.noki600); } },
    682: { qty: function (v) { return v.mekakushiL ? roundDown(v.mekakushiL / 0.9, 1) : 0; } },
    683: { qty: function (v) { return v.paraL ? roundDown(v.paraL / 0.9, 1) : 0; } },
    684: { qty: function (v) { return v.isPG ? 0 : v.fukiAllT; } },
    685: { qty: function (v) { return n(v.q.naibuAshiba); } },
    688: { qty: function (v) { return v.tatami ? roundUp(Math.sqrt(v.tatami) * 4, 2) : 0; } },
    689: { qty: function (v, q, c, cost) { return cost(688) > 0 ? 1 : 0; } },
    691: { qty: function (v, q) { return q(688) > 0 ? 1 : 0; } },
    694: { qty: function () { return 1; }, price: function (v) { return daikuOpOuter(v); } },
    696: { qty: function () { return 1; }, price: function (v) { return daikuOpInner(v); } },
    698: { qty: function (v, q, c) { return c.sash.has ? c.sash.count - c.sash.std.count : 0; } },
    700: { qty: function (v, q, c) { return c.zosaku.count; } },
    701: { qty: function (v, q, c) { return c.shelf.countDiff; } },
    702: { qty: function (v, q, c) { return c.kadou.places; } },
    705: { qty: function (v) { return v.fukiT && v.fukiT < 1 ? 1 : 0; } },
    706: { qty: function (v) { return v.fukiT >= 1 ? 1 : 0; } },
    710: { qty: function (v) { return n(v.q.kawaraHana) ? roundUp(n(v.q.kawaraHana) / 3, 0) : 0; } },
    711: { qty: function (v) { return n(v.q.kawaraNobori) ? roundUp(n(v.q.kawaraNobori) / 3, 0) : 0; } },
    713: { qty: function (v, q) { var s = n(v.q.nokiDe) + n(v.q.nokiSagari); return s ? roundUp(s * 0.5 / 1.65, 0) - q(714) : 0; } },
    714: { qty: function (v) { var s = n(v.q.nokiDe) + n(v.q.nokiSagari); return s ? roundUp(s * 0.5 / 1.65 * 0.2, 0) : 0; } },
    715: { qty: function (v) { return (n(v.q.nokiDe) + n(v.q.nokiSagari)) ? 5 : 0; } },
    718: { qty: function (v) { return v.f.hou22 ? 30 : 0; } },
    719: { qty: function () { return 1; }, price: function (v, c) { return c.shelf.boardDiff; } },
    720: { qty: function () { return 1; }, price: function (v, c) { return c.kadou.board; } },
    750: { qty: function (v, q) { return nokiten(v, q, '淡', false, 713); } },
    751: { qty: function (v, q) { return nokiten(v, q, '淡', true, 713); } },
    752: { qty: function (v, q) { return nokiten(v, q, '濃', false, 713); } },
    753: { qty: function (v, q) { return nokiten(v, q, '濃', true, 713); } },
    754: { qty: function () { return 1; } },
    755: { qty: function (v, q) { return q(728) + q(729); } },
    758: { qty: function (v) { return v.tatami ? roundUp(v.tatami / 1.65, 0) : 0; } },
    762: { qty: function () { return 1; }, price: function (v, c) { return c.shelf.hwDiff; } },
    763: { qty: function () { return 1; }, price: function (v, c) { return c.kadou.hw; } },
    931: { qty: function (v) { return v.f.toilet2F ? 1 : 0; } },
    932: { qty: function (v) { return v.f.tearaiBranch ? 1 : 0; } },
    933: { qty: function (v) { return v.f.tearaiSep ? 1 : 0; } },
    934: { qty: function (v) { return v.f.toilet2F && v.f.choki ? 1 : 0; } },
    // ---- 付帯
    946: { qty: function (v) { return stdIf(v, 1); } },
    947: { qty: function (v) { return stdIf(v, 1); }, price: function (v) { return n(X.jibanChosa) * (v.f.tatekae ? n(X.jibanTatekaeRate) : 1); } },
    948: { qty: function (v) { return stdIf(v, 1); } },
    958: { qty: function (v) { return stdIf(v, v.q.crossGate === '' ? 2 : n(v.q.crossGate)); } },
    959: { qty: function (v) { return stdIf(v, v.q.careNet === '' ? v.shikichi : n(v.q.careNet)); } },
    962: { qty: function (v) { return stdIf(v, 1); } }, 963: { qty: function (v) { return stdIf(v, 1); } },
    964: { qty: function (v) { return stdIf(v, 1); } },
    968: { qty: function (v) { return stdIf(v, 1); }, price: elecStdOnly('kasetsuDenki') },
    973: { qty: function (v) { return stdIf(v, 1); } },
    987: { qty: function (v) { return stdIf(v, 1); }, price: elecStdOnly('kansenHikikomi') },
    988: { qty: function (v) { return stdIf(v, 1); }, price: elecStdOnly('okugaiSwitch') },
    992: { qty: function (v) { return v.f.pole ? 1 : 0; } },
    996: { qty: function (v) { return stdIf(v, 1); } },
    1000: { qty: function () { return 0; } },   // 浄化槽は付帯（見積書）側で金額入力
    // ---- 諸経費
    1022: { qty: function (v) { return v.isPG ? 0 : 1; }, price: function (v) { return v.sekouT * n(X.ippanKanriPerTsubo); } },
    1023: { qty: function (v) { return v.isPG ? 0 : 1; }, price: function (v) { return v.sekouT * n(X.genbaKeihiPerTsubo); } },
    1024: { qty: function (v) { return stdIf(v, 1); } }, 1025: { qty: function (v) { return stdIf(v, 1); } },
    1027: { qty: function (v) { return v.isPG ? 0 : stdIf(v, 1); } },
    1028: { qty: function (v) { return v.isPG ? 1 : 0; } }, 1029: { qty: function (v) { return v.isPG ? 1 : 0; } },
    1030: { qty: function (v) { return stdIf(v, 1); } },
    1031: { qty: function (v) { return v.isPG ? 0 : stdIf(v, 1); } },
    1050: { qty: function (v) { return v.isPG ? 1 : 0; } }
  };
  // 標準サッシ（契約内訳329〜335：フジタ/STO、345〜349：PG）
  [[329, 4], [330, 5], [331, 6], [332, 7], [333, 8], [334, 9], [335, 10], [345, 12], [346, 13], [347, 14], [348, 15], [349, 16]].forEach(function (m) {
    RULES[m[0]] = {
      qty: function (v, q, c) { var l = findStd(c.sash.std.lines, m[1]); return l ? l.qty : 0; },
      price: function (v, c) { var l = findStd(c.sash.std.lines, m[1]); return l && l.qty ? l.cost / l.qty : 0; }
    };
  });
  RULES[337] = { qty: function (v, q) { var s = 0; for (var r = 329; r <= 335; r++) s += q(r); return s > 0 ? 1 : 0; } };
  // 標準既製建具（363〜370：フジタ/STO、379〜382：PG）
  [[363, 5], [364, 6], [365, 7], [366, 8], [367, 9], [368, 10], [369, 11], [370, 12], [379, 14], [380, 15], [381, 16], [382, 17]].forEach(function (m) {
    RULES[m[0]] = {
      qty: function (v, q, c) { var l = findStd(c.door.std.lines, m[1]); return l ? l.qty : 0; },
      price: function (v, c) { var l = findStd(c.door.std.lines, m[1]); return l ? l.unitCost : 0; }
    };
  });
  RULES[372] = { qty: function (v, q) { var s = 0; for (var r = 363; r <= 370; r++) s += q(r); return s > 0 ? 1 : 0; } };
  RULES[384] = { qty: function (v, q) { var s = 0; for (var r = 379; r <= 382; r++) s += q(r); return s > 0 ? 1 : 0; } };
  // 商品モジュールが直接計上する行（Excelの特殊式の行）は明細エンジンでは 0 扱い
  [823, 869, 868, 904, 914, 761, 930, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046].forEach(function (r) { RULES[r] = { skip: true }; });

  function findStd(lines, row) { for (var i = 0; i < lines.length; i++) if (lines[i].row === row) return lines[i]; return null; }
  function notPG(v) { return v.isPG ? 0 : 1; }
  function onlyPG(v) { return v.isPG ? 1 : 0; }
  function notSTO(v) { return v.isSTO ? 0 : 1; }
  function stdOne(v) { return v.sekouT ? 1 : 0; }
  function siding(row) { return function (v) { var s = X.siding[row] || {}; return n(v.isPG ? s.pg : s.normal); }; }
  function elecStdOnly(key) { return function (v) { var k = v.p.elecKubun || '標準'; return (k === '標準' || k === '') ? n(X[key]) : 0; }; }
  function light(row) { return function (v) { if (!v.sekouT || v.kani) return 0; return n(KOUJI[row].pnum); }; }
  function yukaIns(v, thick) { return (v.isFujita && n(v.p.yukashita) === thick && v.ichiF) ? roundUp(v.ichiF / 1.65, 0) : 0; }
  function gaibuArea(v) { return 0; } // 外部収納ケイカル塗装：Excelでも面積セル未入力のため 0（手入力で上書き可）
  // 軒天AEP：判定は ポーチ軒裏＋屋根軒裏 の合計面積（L430）、21㎡以上の数量はそれぞれの面積
  function nokitenArea(q) {
    var porch = (q(206) + q(207)) * 1.65, roof = (q(713) + q(714)) * 1.65;
    return { porch: porch, roof: roof, total: porch + roof };
  }
  function nokiten(v, q, color, big, baseRow) {
    if (v.isPG) return 0;
    var a = nokitenArea(q);
    if (!a.total || v.p.nokitenColor !== color) return 0;
    if (!big) return a.total < 20 ? 1 : 0;
    return a.total >= 20 ? (baseRow === 206 ? a.porch : a.roof) : 0;
  }

  // ------------------------------------------------------------------ 明細 1 行の評価（Excel の U/W/Y/AB/J/O 列）
  function evalLine(it, qty, price, genka) {
    var w = n(price);
    if (it.net) w = roundDown(w * it.net, 0);
    if (it.rate2) w = roundDown(w * it.rate2, 0);
    var cost = roundDown(w * qty, 0);
    var y = w ? roundUp(w / genka, -it.z) : 0;    // 計上単価
    var sell;
    if (!it.h) sell = 0;                           // 原価のみの行（保証費など）
    else if (it.h === '式') sell = roundUp(y * qty, it.abRound);
    else sell = roundDown(y * qty, 0);
    return { unit: w, sellUnit: y, cost: cost, sell: sell };
  }

  // ------------------------------------------------------------------ 全体計算
  function evaluate(p) {
    var v = derive(p);
    var c = {};
    c.sash = sashCalc(v);
    c.door = doorCalc(v);
    c.zosaku = zosakuCalc(v);
    c.shelf = shelfCalc(v);
    c.kadou = kadouCalc(v);
    c.elec = elecCalc(v);
    c.plumb = plumbCalc(v);
    c.daiku = daikuStd(v, { sashStdCount: c.sash.std.count, doorStdCount: c.door.std.count, shelfStdCount: c.shelf.std.count });

    var ov = p.overrides || {};
    var qtyCache = {}, costCache = {};
    function qtyOf(row) {
      if (row in qtyCache) return qtyCache[row];
      qtyCache[row] = 0; // 循環参照防止
      var it = KOUJI[row], r = RULES[row], val = 0;
      var o = ov[row];
      if (o && o.qty !== '' && o.qty != null) val = n(o.qty);
      else if (r && r.skip) val = 0;
      else if (r && r.qty) val = n(r.qty(v, qtyOf, c, costOf));
      else if (it && it.qtyConst != null && !it.qtyFormula) val = n(it.qtyConst);
      else val = 0;
      qtyCache[row] = clean(val);
      return qtyCache[row];
    }
    function priceOf(row) {
      var it = KOUJI[row], r = RULES[row], o = ov[row];
      if (o && o.price !== '' && o.price != null) return n(o.price);
      if (r && r.price) return n(r.price(v, c, qtyOf));
      return n(it.price);
    }
    function costOf(row) { if (!(row in costCache)) costCache[row] = lineOf(row).cost; return costCache[row]; }
    function lineOf(row) {
      var it = KOUJI[row];
      var qty = qtyOf(row), price = priceOf(row);
      var g = (row >= 643 && row <= 670) ? v.setsubi : v.genka;   // 住設は住設原価率
      var e = evalLine(it, qty, price, g);
      var r = RULES[row] || {};
      if (r.mul) { var m = r.mul(v); e.cost *= m; e.sell *= m; }
      if (r.costMul) e.cost *= r.costMul(v);
      return { row: row, item: it, qty: qty, price: price, unit: e.unit, sellUnit: e.sellUnit, cost: e.cost, sell: e.sell,
        overridden: !!(ov[row] && ((ov[row].qty !== '' && ov[row].qty != null) || (ov[row].price !== '' && ov[row].price != null))) };
    }

    var lines = D.kouji.map(function (it) { var l = lineOf(it.row); costCache[it.row] = l.cost; return l; });

    // ---- 商品モジュール・特殊行（Excelで J/O 列が特殊式の行）を仮想明細として追加
    var virt = [];
    function vline(row, sec, tag, name, spec, sell, cost, extra) {
      var o = { row: row, virtual: true, item: { row: row, sec: sec, tag: tag, name: name, spec: spec || '', h: '式', unit: '式' },
        qty: 1, price: null, sell: sell, cost: cost };
      for (var k in extra || {}) o[k] = extra[k];
      virt.push(o);
    }
    var OPSEC = 'Ｂ オプション工事費';
    if (c.sash.has) {
      vline(823, OPSEC, 'OP', '金属製建具工事─①', '標準金属製建具（控除）', -c.sash.std.sell, -c.sash.std.cost);
      vline(824, OPSEC, 'OP', 'プランごとサッシ', c.sash.lines.length + '行 / ' + c.sash.count + 'カ所', c.sash.sell, c.sash.cost);
    }
    if (c.door.has) {
      vline(868, OPSEC, 'OP', '既製建具工事', '標準既製建具（控除）', -c.door.std.sell, -c.door.std.cost);
      vline(869, OPSEC, 'OP', 'プランごと既製建具', c.door.count + 'カ所（取付費込）', c.door.sell, c.door.cost);
    }
    if (c.zosaku.lines.length) vline(904, OPSEC, 'OP', 'プランごと造作建具', c.zosaku.count + '枚' + (c.zosaku.install ? '・搬入取付費込' : ''), c.zosaku.sell, c.zosaku.cost);
    if (p.f.oyaneKawara) vline(784, OPSEC, 'OP', '大屋根が瓦の場合', '板金屋根 ▲（原価のみ）', 0, -sum([278, 279, 280, 281, 282], costOf));
    if (p.f.geyaKawara) vline(785, OPSEC, 'OP', '下屋が瓦の場合', '板金屋根 ▲（原価のみ）', 0, -sum([285, 286, 287, 288, 289], costOf));
    if (p.f.gaihekiOther) {
      vline(820, OPSEC, 'OP', 'ｻｲﾃﾞｨﾝｸﾞと入れ替え', '原価のみ控除', 0, -sum([516, 517, 518, 519, 520], costOf));
      var l437 = lines.filter(function (l) { return l.row === 437; })[0];
      vline(821, OPSEC, 'OP', '弾性ﾘｼﾝと入れ替え', '', -(l437 ? l437.sell : 0), -(l437 ? l437.cost : 0));
    }
    // 設計・申請費（契約内訳 1039〜1048）
    var des = designFees(v);
    des.forEach(function (d) { vline(d.row, '３． 申請費用等', '設計', d.name, d.spec, d.sell, d.cost); });

    var all = lines.concat(virt).sort(function (a, b) { return a.row - b.row; });
    var byTag = { '基': { sell: 0, cost: 0 }, 'OP': { sell: 0, cost: 0 }, '付帯': { sell: 0, cost: 0 }, '諸': { sell: 0, cost: 0 }, '設計': { sell: 0, cost: 0 } };
    all.forEach(function (l) { var t = byTag[l.item.tag]; if (t) { t.sell += l.sell; t.cost += l.cost; } });

    // 工種別小計（標準部分）
    var secTotals = {};
    all.forEach(function (l) {
      var k = l.item.sec; if (!secTotals[k]) secTotals[k] = { sec: k, tag: l.item.tag, sell: 0, cost: 0 };
      secTotals[k].sell += l.sell; secTotals[k].cost += l.cost;
    });

    var est = estimate(p, v, c, all, byTag);
    return { v: v, c: c, lines: all, byTag: byTag, secTotals: secTotals, est: est };
  }

  // ------------------------------------------------------------------ 設計・申請費
  function designFees(v) {
    var d = X.design, f = v.f, out = [];
    if (!v.sekouT) return out;
    var gaihi = (f.bels || f.choki) ? roundUp(d.gaihi[0] + d.gaihi[1] * v.sekouT, -3) : 0;
    var kouzou = n(v.p.taishin) === 3 ? roundUp(d.kouzou[0] + d.kouzou[1] * v.sekouT, -3) : 0;
    out.push({ row: 1039, name: '構造計算費', spec: '耐震等級3', sell: kouzou, cost: 0 });
    var belsDoc = roundUp(f.bels && !f.choki ? d.belsDoc + gaihi : (f.bels && f.choki ? d.belsDoc : 0), -3);
    out.push({ row: 1041, name: 'BELS申請書作成費', spec: '', sell: belsDoc, cost: 0 });
    var chokiDoc = roundUp(f.choki ? d.chokiDoc + gaihi : 0, -3);
    out.push({ row: 1042, name: '長期申請書作成費', spec: '外皮計算込', sell: chokiDoc, cost: 0 });
    var kakunin = 0;
    if (f.kakunin) kakunin = roundUp(v.nobe < 200 ? d.kakunin[0] : d.kakunin[1], -3);
    out.push({ row: 1043, name: '確認申請費用', spec: v.nobe >= 500 ? '500㎡以上は要問合せ' : '', sell: kakunin, cost: f.kakunin ? n(v.p.kakuninCost) : 0 });
    out.push({ row: 1044, name: '性能評価申請費用', spec: '', sell: 0, cost: (f.seinou && !f.choki) ? n(d.seinou) : 0 });
    var bels = roundUp((f.seinou && f.bels) ? d.bels[1] : (f.bels && f.choki) ? d.bels[1] : (f.bels && !f.seinou) ? d.bels[0] : 0, -3);
    out.push({ row: 1045, name: 'BELS申請費用', spec: '', sell: bels, cost: bels });
    var fee = cityChokiFee(v.p.info.city);
    var chokiCost = f.choki ? n(d.choki) + fee : 0;
    out.push({ row: 1046, name: '長期優良住宅申請費用', spec: f.choki ? '認定料 ' + fee.toLocaleString() + '円込' : '', sell: roundUp(chokiCost, -3), cost: chokiCost });
    var k = d.kashi, nb = v.nobe, kashi = 0;
    if (f.kashi) kashi = nb < 100 ? k[0] : nb < 125 ? k[1] : nb < 150 ? k[2] : nb < 200 ? k[3] : nb < 500 ? k[4] : 0;
    out.push({ row: 1048, name: '瑕疵担保', spec: '延床' + nb + '㎡', sell: kashi, cost: kashi });
    return out;
  }
  function cityChokiFee(city) {
    var list = D.input.cities;
    for (var i = 0; i < list.length; i++) if (list[i].name === city) return n(list[i].chokiFee);
    return 0;
  }

  // ------------------------------------------------------------------ 見積書（A 本体+付帯 / B 申請費用他 / C オプション）
  var C_CATS = [
    { key: 'kiso', name: '基礎工事', spec: '高基礎', rows: [673, 675] },
    { key: 'yane', name: '屋根変更', spec: '板金屋根 → 瓦屋根', rows: [781, 790] },
    { key: 'gaiso', name: '外装変更', spec: '', rows: [791, 822] },
    { key: 'mokuzai', name: '木材', spec: '下屋割増、軒追加、目隠し塀等', rows: [676, 689] },
    { key: 'daiku', name: '大工工事', spec: '上記手間、棚板手間、建具手間等', rows: [693, 703] },
    { key: 'ashiba', name: '内部足場', spec: '', rows: [704, 706] },
    { key: 'kenzai', name: '建材等', spec: '軒裏ケイカル・畳・塗装工事等', rows: [690, 692], rows2: [707, 779] },
    { key: 'sash', name: '金属製建具 変更差額', spec: '', rows: [823, 867] },
    { key: 'door', name: '既製建具 変更差額', spec: '', rows: [868, 901] },
    { key: 'zosaku', name: '造作建具 変更差額', spec: '', rows: [902, 928] },
    { key: 'elec', name: '電気工事 変更差額', spec: '', module: 'elec' },
    { key: 'plumb', name: '給排水衛生配管工事 変更差額', spec: '', rows: [929, 943], module: 'plumb' },
    { key: 'extra', name: 'その他追加工事', spec: '', module: 'extra' }
  ];

  function estimate(p, v, c, all, byTag) {
    var e = p.est || {};
    var fu = e.futai || {};
    // ---- C オプション
    var cLines = C_CATS.map(function (cat) {
      var sell = 0, cost = 0;
      function inRange(r, rg) { return rg && r >= rg[0] && r <= rg[1]; }
      if (cat.rows) all.forEach(function (l) {
        if (l.item.tag !== 'OP') return;
        if (inRange(l.row, cat.rows) || inRange(l.row, cat.rows2)) { sell += l.sell; cost += l.cost; }
      });
      if (cat.module === 'elec') { sell += c.elec.sell; cost += c.elec.cost; }
      if (cat.module === 'plumb') { sell += c.plumb.sell; cost += c.plumb.cost; }
      if (cat.module === 'extra') (p.extras || []).forEach(function (x) { sell += n(x.sell) * n(x.qty); cost += n(x.cost) * n(x.qty); });
      return { key: cat.key, name: cat.name, spec: cat.spec, sell: sell, cost: cost };
    });
    var cEx = sum(cLines, function (l) { return l.sell; }) + n(e.discountC);
    var cCost = sum(cLines, function (l) { return l.cost; });

    // ---- A 付帯（お客様向け定額）
    var poleSell = 0;
    all.forEach(function (l) { if (l.row === 992) poleSell = l.sell; });
    var haisui = n(fu.haisui);
    var extraM = Math.max(0, n(p.q.haisuiLen) - 6);
    var futai = [
      { key: 'chosa', name: '敷地調査費', amount: n(fu.chosa) },
      { key: 'jiban', name: '地盤調査費', amount: n(fu.jiban) },
      { key: 'kansen', name: '屋外幹線引込工事費', amount: n(fu.kansen) },
      { key: 'haisui', name: '屋外給排雨水工事', spec: extraM ? '6m超過 ' + extraM + 'm 加算' : '6mまで', amount: haisui + extraM * 10000 },
      { key: 'jigyo', name: '地業・整地工事費', amount: n(fu.jigyo) },
      { key: 'kasetsu', name: '共通仮設費', amount: n(fu.kasetsu) },
      { key: 'zousei', name: '造成費', amount: n(fu.zousei) },
      { key: 'chiiki', name: '地域調査費', amount: n(fu.chiiki) },
      { key: 'solar', name: '太陽光発電工事', amount: n(fu.solar) },
      { key: 'pole', name: '引込ポール', amount: poleSell },
      { key: 'jokaso', name: '浄化槽設置工事', amount: n(fu.jokaso) },
      { key: 'gas', name: '都市ガス対応工事', amount: n(fu.gas) }
    ];
    var futaiEx = sum(futai, function (l) { return l.amount; });

    // ---- B 申請費用他
    var design = roundDown(v.sekouT * n(e.designUnit || 40000), 0);
    var shinsei = n(e.shinsei);

    function shokeihi(honTai) {
      var aIncl = (honTai + futaiEx + n(e.discountA)) * 1.1;
      var cIncl = cEx * 1.1;
      return roundUp((aIncl + cIncl) * 0.02 / 1.1, -3) + n(e.shokeihiAdj);
    }
    // ---- 坪単価（自動）：本体＋付帯＋申請費用他 = 積算（標準＋付帯＋諸経費＋設計）となる本体金額を求める
    var baseTarget = byTag['基'].sell + byTag['付帯'].sell + byTag['諸'].sell + byTag['設計'].sell;
    var x = baseTarget - futaiEx - design - shinsei;
    for (var i = 0; i < 20; i++) {
      var nx = baseTarget - futaiEx - design - shinsei - shokeihi(x);
      if (Math.abs(nx - x) < 0.5) { x = nx; break; }
      x = nx;
    }
    var tsuboAuto = v.sekouT ? roundUp(x / v.sekouT, n(e.tsuboRound) || -2) : 0;
    var tsubo = e.tsubo !== '' && e.tsubo != null ? n(e.tsubo) : tsuboAuto;
    var honTai = roundDown(v.sekouT * tsubo, 0);
    var shokei = v.sekouT ? shokeihi(honTai) : 0;

    function tax(x) { return Math.floor(clean(x * 0.1)); }
    var aEx = honTai + futaiEx + n(e.discountA);
    var bEx = design + shinsei + shokei + n(e.discountB);
    var A = { honTai: honTai, tsubo: tsubo, tsuboAuto: tsuboAuto, futai: futai, discount: n(e.discountA), ex: aEx, tax: tax(aEx), total: aEx + tax(aEx) };
    var B = { design: design, designUnit: n(e.designUnit || 40000), shinsei: shinsei, shokeihi: shokei, discount: n(e.discountB), ex: bEx, tax: tax(bEx), total: bEx + tax(bEx) };
    var C = { lines: cLines, discount: n(e.discountC), ex: cEx, tax: tax(cEx), total: cEx + tax(cEx) };
    var totalEx = aEx + bEx + cEx;
    var total = A.total + B.total + C.total;

    // ---- 原価・粗利（社内用）
    var kouji = byTag['基'].cost + byTag['OP'].cost + byTag['付帯'].cost + byTag['諸'].cost + byTag['設計'].cost;
    var costAll = kouji + c.elec.cost + c.plumb.cost + sum(p.extras || [], function (x) { return n(x.cost) * n(x.qty); });
    var sekisan = baseTarget + byTag['OP'].sell;
    return {
      A: A, B: B, C: C, totalEx: totalEx, total: total, tax: A.tax + B.tax + C.tax,
      sekisan: sekisan, baseTarget: baseTarget, cost: costAll,
      profit: totalEx - costAll, margin: totalEx ? (totalEx - costAll) / totalEx : 0,
      perTsubo: v.sekouT ? totalEx / v.sekouT : 0
    };
  }

  var api = {
    D: D, KOUJI: KOUJI, SASH: SASH, DOORS: DOORS, ZOSAKU: ZOSAKU, SHELVES: SHELVES, KADOU: KADOU, RULES: RULES,
    newProject: newProject, evaluate: evaluate, derive: derive, tsubo: tsubo,
    roundUp: roundUp, roundDown: roundDown, n: n, genkaRate: genkaRate,
    sashCosts: sashCosts, sashLine: sashLine, doorUnitCost: doorUnitCost, sashStd: sashStd, doorCalc: doorCalc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
