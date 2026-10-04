#!/usr/bin/env python3
"""sales-crm.html（アーティファクト用の本体）から、GitHub Pages 用の docs/index.html を作る。

本体は1つだけにして、置き場所の違い（データベースとカレンダー連携）は
この薄い差し替えだけで吸収する。
"""
import pathlib, sys, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC  = ROOT / "sales-crm.html"
OUT  = ROOT / "docs" / "index.html"
FIREBASE = "10.14.1"

# 置き場所が変わることで実情に合わなくなる文言だけ差し替える
TEXT_SWAPS = [
 ('公開されたリンクから開いたときにデータへ接続します。ファイルを直接開いた場合や権限が無い場合は読み書きできません。リンクから開き直してください。',
  'Firebase の設定がまだのようです。docs/firebase-config.js に、ご自身の Firebase プロジェクトの設定を貼り付けてください。設定済みで出る場合は、通信が遮断されているか、Firestore のルールで読み書きが許可されていません。'),
 ('この画面ではGoogleカレンダー連携を使えません。公開されたリンクから開き直してください。',
  'Googleカレンダー連携は、この版では使えません（Claude で公開した版のみの機能です）。'),
 # AI（Claude）の機能はこの版に無いので、案内ごと出さない
 ('''      : '<p class="tiny faint" style="margin-bottom:11px">文字起こしから議事録を作る機能は、Claude で公開した版でのみ使えます。</p>')+''',
  '''      : '')+'''),
 ('文字起こしを貼ると Claude が議事録にまとめます（Claude版のみ）。', ''),
]

HEAD = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<style>:root{color-scheme:light dark}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found]){display:none!important}</style>
</head>
<body>
'''

SHIM = '''
<script>
/* ------------------------------------------------------------
   アプリ本体は claude.use("db") からデータベースを受け取る作りなので、
   ここで Firebase を同じ形にして渡す。本体には手を入れない。
   ------------------------------------------------------------ */
(function(){
  var resolveDb;
  var dbReady = new Promise(function(r){ resolveDb = r; });
  window.__crmResolveDb = resolveDb;
  /* Chromium は blob からの保存で日本語のファイル名を捨て、拡張子の無い
     「download」にしてしまう。半角だけの名前に直して拡張子を守る。 */
  function safeName(n){
    var s = String(n || "download.csv");
    if(/^[\x20-\x7E]+$/.test(s)) return s;
    var m = s.match(/(\.[A-Za-z0-9]{1,8})$/);
    var ext = m ? m[1] : ".txt";
    var base = s.slice(0, s.length - ext.length).replace(/[^\x20-\x7E]+/g, "")
                .replace(/[\\\/:*?"<>|]+/g, "").replace(/^[-_\s]+|[-_\s]+$/g, "");
    return "crm-" + (base || "data") + ext;
  }
  var downloads = { save: function(o){
    return new Promise(function(res, rej){
      try{
        var blob = new Blob([o.data], {type:"text/csv;charset=utf-8"});
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = safeName(o.filename); a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a); a.click();
        /* すぐに消すと、保存が始まる前にファイル名を見失うことがある */
        setTimeout(function(){ a.remove(); URL.revokeObjectURL(url); }, 20000);
        res({ok:true});
      }catch(e){ rej(e); }
    });
  }};
  window.claude = { use: function(name){
    if(name === "db") return dbReady;
    if(name === "downloads") return Promise.resolve(downloads);
    return Promise.resolve(null);   /* mcp（Googleカレンダー）はこの版では無し */
  }};
})();
</script>
<script src="firebase-config.js"></script>
<script type="module">
const cfg = window.FIREBASE_CONFIG || {};
const notSet = !cfg.projectId || String(cfg.projectId).indexOf("ここに") === 0;
if(notSet){
  /* Firebase の設定がまだのときは「お試し版」：この端末のブラウザの中だけに保存する */
  window.__crmResolveDb(makeLocalDb());
  const showBar = () => document.body.insertAdjacentHTML("afterbegin",
    '<div id="demoBar" style="position:sticky;top:0;z-index:300;background:#7a5b14;color:#fff;font-size:12px;line-height:1.5;padding:6px 12px;text-align:center">'+
    'お試し版：入力した内容は<b>この端末のこのブラウザだけ</b>に保存され、他の人とは共有されません'+
    '<button type="button" id="demoReset" style="margin-left:10px;font-size:11px;border:1px solid rgba(255,255,255,.6);background:none;color:#fff;border-radius:99px;padding:1px 9px;cursor:pointer">お試しデータを消す</button></div>');
  if(document.body) showBar(); else document.addEventListener("DOMContentLoaded", showBar);
  document.addEventListener("click", e => {
    if(e.target && e.target.id === "demoReset" && confirm("お試しで入れた内容（パスワード・名簿・お客様など）をすべて消して、最初からにします。よろしいですか？")){
      try{ localStorage.removeItem("crm-demo-v1"); localStorage.removeItem("crm.login"); }catch(_){}
      location.reload();
    }
  });
}else{
  const { initializeApp } = await import("__FB__/firebase-app.js");
  const { getFirestore, doc, collection, onSnapshot, setDoc, deleteDoc, addDoc } = await import("__FB__/firebase-firestore.js");
  const db = getFirestore(initializeApp(cfg));
  /* undefined を含む値は Firestore が受け付けないため、JSON を通して落とす */
  const clean = o => JSON.parse(JSON.stringify(o == null ? {} : o));
  const wrapDoc = path => ({
    onSnapshot(cb, err){
      return onSnapshot(doc(db, path),
        s => cb({ exists: s.exists(), data: () => s.data() || {} }),
        err || function(){});
    },
    set:    o => setDoc(doc(db, path), clean(o)),
    update: o => setDoc(doc(db, path), clean(o), {merge:true}),
    delete: () => deleteDoc(doc(db, path)),
  });
  const wrapCol = name => ({
    onSnapshot(cb, err){
      return onSnapshot(collection(db, name),
        s => cb({ docs: s.docs.map(d => ({ id: d.id, data: () => d.data() })) }),
        err || function(){});
    },
    add: async o => ({ id: (await addDoc(collection(db, name), clean(o))).id }),
  });
  window.__crmResolveDb({ doc: wrapDoc, collection: wrapCol });
}

/* お試し版のデータ置き場（localStorage）。Firestore と同じ呼び方で使えるようにする */
function makeLocalDb(){
  const KEY = "crm-demo-v1";
  let data = {};
  try{ data = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ data = {}; }
  const ls = new Set();
  const clone = o => JSON.parse(JSON.stringify(o == null ? {} : o));
  const save = () => { try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){} };
  const notify = () => setTimeout(() => ls.forEach(f => { try{ f(); }catch(e){} }), 0);
  /* 同じ端末の別タブで変えたときも反映する */
  window.addEventListener("storage", e => { if(e.key === KEY){ try{ data = JSON.parse(e.newValue || "{}") || {}; }catch(_){} notify(); } });
  const split = p => { const i = p.indexOf("/"); return [p.slice(0, i), p.slice(i + 1)]; };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const col = c => (data[c] = data[c] || {});
  const wrapDoc = path => { const [c, id] = split(path); return {
    onSnapshot(cb){ const f = () => { const v = data[c] && data[c][id]; cb({ exists: !!v, data: () => clone(v) }); };
      ls.add(f); setTimeout(f, 0); return () => ls.delete(f); },
    set:    async o => { col(c)[id] = clone(o); save(); notify(); },
    update: async o => { col(c)[id] = Object.assign({}, col(c)[id] || {}, clone(o)); save(); notify(); },
    delete: async () => { if(data[c]) delete data[c][id]; save(); notify(); },
  }; };
  const wrapCol = c => ({
    onSnapshot(cb){ const f = () => cb({ docs: Object.entries(data[c] || {}).map(([id, v]) => ({ id, data: () => clone(v) })) });
      ls.add(f); setTimeout(f, 0); return () => ls.delete(f); },
    add: async o => { const id = newId(); col(c)[id] = clone(o); save(); notify(); return { id }; },
  });
  return { doc: wrapDoc, collection: wrapCol };
}
</script>
'''

def main():
    body = SRC.read_text(encoding="utf-8")
    for a, b in TEXT_SWAPS:
        if a not in body:
            sys.exit("本体の文言が見つかりません（build-web.py の TEXT_SWAPS を直してください）:\n  " + a[:50])
        body = body.replace(a, b, 1)
    base = sys.argv[1] if len(sys.argv) > 1 else "https://www.gstatic.com/firebasejs/" + FIREBASE
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(HEAD + SHIM.replace("__FB__", base) + "\n" + body + "\n</body>\n</html>\n", encoding="utf-8")
    print("wrote", OUT.relative_to(ROOT), OUT.stat().st_size, "bytes")

main()
