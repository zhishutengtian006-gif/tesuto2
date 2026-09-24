/*
 * 積算エンジンの突合テスト
 *   node tests/engine.test.js
 *
 * 見積Excel（2026.08.19版）に入っていたサンプル入力を再現し、
 * 契約内訳の工種別小計・区分合計が Excel の計算結果と一致するかを確認する。
 */
'use strict';
var assert = require('assert');
var fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, '../js/master-data.js'))) {
  console.error('js/master-data.js がありません。先に python3 tools/extract_master.py 見積書.xlsm で単価マスタを生成してください。');
  process.exit(1);
}
var E = require('../js/engine.js');

var failures = 0, passed = 0;
function check(name, actual, expected) {
  try { assert.strictEqual(Math.round(actual), expected); passed++; console.log('  ok  ' + name + ' = ' + expected.toLocaleString()); }
  catch (e) { failures++; console.log('  NG  ' + name + ': 期待 ' + expected.toLocaleString() + ' / 実際 ' + Math.round(actual).toLocaleString()); }
}

// ---- Excelサンプルの入力値
function sampleProject() {
  var p = E.newProject();
  p.kubun = '通常';
  p.spec = 'フジタ';
  p.floors = '';               // サンプルは階数未選択
  p.taishin = '';              // 耐震等級未入力（構造計算費なし）
  p.area.kenchiku = 80; p.area.f1 = 75; p.area.tatami = 9.72; p.area.porch = 3;
  p.q.gaiheki = 350; p.q.nokiDe = 10; p.q.porchNoRoof = 3;
  p.q.habaki = 130; p.q.mawaribuchi = 50; p.q.habakiCorner = 40;
  p.fukitsuke = 467; p.yukashita = 75; p.nokitenColor = '濃';
  p.info.city = '白山市';
  p.kakuninCost = 49000;
  p.f.kakunin = p.f.seinou = p.f.bels = p.f.choki = p.f.kashi = true;
  // 契約時入力：固定棚（4.5尺の側板×4）、造作建具（row57×1, row59×2）、可動棚1箇所
  p.shelves = [{ row: 6, qty: 0, side: 4 }];
  p.zosaku = [{ row: 57, qty: 1 }, { row: 59, qty: 2 }];
  p.zosakuInstallAuto = false;   // サンプルは搬入取付費を入力していない
  p.kadou.places = 1;
  return p;
}

var r = E.evaluate(sampleProject());
var s = r.secTotals;
function sec(prefix) { for (var k in s) if (k.indexOf(prefix) === 0 && s[k].tag === '基') return s[k]; return { sell: 0, cost: 0 }; }

console.log('■ 名前付き値（入力用シート）');
check('施工床坪×100', r.v.sekouT * 100, 2359);
check('延床坪×100', r.v.nobeT * 100, 2268);
check('下屋坪×100', r.v.geyaT * 100, 2420);
check('大工標準原価', r.c.daiku.total, 1005106);

console.log('■ 工種別 標準小計（契約内訳 J列）');
check('1 仮設工事', sec('1 仮設').sell, 358800);
check('2 基礎工事', sec('2 基礎').sell, 3161700);
check('3 木工事（構造材）', sec('3 木工事').sell, 106300);
check('4 木工事（造作材）', sec('4 木工事').sell, 192400);
check('5 木工事（大工工料他）', sec('5 木工事').sell, 1611100);
// 241行（廻縁①）：Excelは誤って入力用!B14（敷地外周）を参照しており、サンプルでは0。本システムは仕様で判定して計上する
var fix241 = r.lines.filter(function (l) { return l.row === 241; })[0].sell;
check('6 建材工事（241行を除く）', sec('6 建材').sell - fix241, 1113500);
check('9 金属製建具工事', sec('9 金属').sell, 794200);
check('10 既製建具工事', sec('10 既製').sell, 393800);
check('13 塗装工事', sec('13 塗装').sell, 1155000);
check('15 断熱工事', sec('15 断熱').sell, 418900 + 440000);
check('16 外装工事', sec('16 外装').sell, 1941100);
check('18 雑工事', sec('18 雑').sell, 306500);
check('19 電気設備工事', sec('19 電気').sell, 873900 + 131620);
check('20 給排水衛生設備工事', sec('20 給排').sell, 484700 + 2519300);

console.log('■ 区分合計（契約内訳 A列）');
check('【基】標準（241行を除く）', r.byTag['基'].sell - fix241, 16002820);
check('【OP】オプション', r.byTag['OP'].sell, 1309200);
check('【付帯】', r.byTag['付帯'].sell, 941200);
check('【諸】', r.byTag['諸'].sell, 759000);
check('【設計】', r.byTag['設計'].sell, 422020);
check('【設計】原価', r.byTag['設計'].cost, 176420);

console.log('■ 原価（契約内訳 O列）');
check('【OP】原価', r.byTag['OP'].cost, 849475 - 907 + 907);   // 造作金物(761/-914)は相殺
check('【付帯】原価', r.byTag['付帯'].cost, 610000);
check('【諸】原価', r.byTag['諸'].cost, 772030);

console.log('■ 見積書');
check('付帯工事費（お客様向け）', r.est.A.futai.reduce(function (t, l) { return t + l.amount; }, 0), 1715000);
check('設計費用', r.est.B.design, 943600);

// ---- サッシ・建具を選んだときの差額
console.log('■ サッシ選択（標準と同じ7カ所を選ぶ → 差額0）');
var p2 = sampleProject();
p2.sash = [4, 5, 6, 8, 9, 10].map(function (row) { return { row: row, glass: 'clear', qty: 1 }; }).concat([{ row: 7, glass: 'frost', qty: 1 }]);
var r2 = E.evaluate(p2);
check('サッシ標準 売価', r2.c.sash.std.sell, 794200);
check('サッシ選択 売価', r2.c.sash.sell, 794200);
check('サッシ OP差額', r2.c.sash.opSell, 0);
check('契約時サッシ取付手間の数量', r2.lines.filter(function (l) { return l.row === 698; })[0].qty, 0);

console.log('■ サッシ変更（AW03 16507 → 16509 に変更）');
p2.sash[2] = { row: 255, glass: 'clear', qty: 1 };   // AW03(16507) → 引違窓 16509
var r3 = E.evaluate(p2);
// 16509 の売価は②ｻｯｼ S9 と同値、16507 は S6 と同値
check('差額', r3.c.sash.opSell, 66000 - 57000);

console.log('■ 既製建具（標準8枚＋取付費 → 差額0）');
var p3 = sampleProject();
p3.doors = [5, 6, 7, 8, 9, 10, 11, 12].map(function (row) { return { row: row, qty: 1 }; });
var r4 = E.evaluate(p3);
check('既製建具 標準売価', r4.c.door.std.sell, 393800);
check('既製建具 差額', r4.c.door.opSell, 0);

console.log('\n' + passed + ' 件 OK / ' + failures + ' 件 NG');
if (failures) process.exit(1);
