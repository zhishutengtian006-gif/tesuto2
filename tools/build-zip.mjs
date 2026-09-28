/* 郵便番号 → 住所（町名まで）の表 zip-jp.js を作る。
   データは日本郵便の公式データを整形した npm パッケージ jp-postal（MIT）を使う。
     npm pack jp-postal && tar xzf jp-postal-*.tgz   （package/ に展開される）
     node tools/build-zip.mjs package/index.mjs
   出力：zip-jp.js と docs/zip-jp.js
   形式：window.__ZIP = {v, c:[[都道府県,市区町村],...], z:{郵便番号:[市区町村番号, 町名, 町名...]}} */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const src = process.argv[2];
if(!src){ console.error('usage: node tools/build-zip.mjs <jp-postal/index.mjs>'); process.exit(1); }
const postal = (await import(pathToFileURL(path.resolve(src)).href)).default;
const clean = t => String(t||'').replace(/（[^）]*）?/g,'').replace(/^以下に掲載がない場合$/,'')
  .replace(/の次に番地がくる場合$/,'').replace(/一円$/,'').trim();
const cities = [], idx = new Map(), z = {};
for(const [code, rows] of Object.entries(postal)){
  const r = rows[0], key = r[0]+r[1];
  if(!idx.has(key)){ idx.set(key, cities.length); cities.push([r[0], r[1]]); }
  const towns = [...new Set(rows.filter(x=>x[0]+x[1]===key).map(x=>clean(x[2])))].filter(Boolean);
  z[code] = [idx.get(key), ...towns];
}
const js = 'window.__ZIP=' + JSON.stringify({v:'2025-12', c:cities, z}) + ';\n';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
for(const f of ['zip-jp.js', 'docs/zip-jp.js']) fs.writeFileSync(path.join(root, f), js);
console.log('codes', Object.keys(z).length, 'bytes', Buffer.byteLength(js));
