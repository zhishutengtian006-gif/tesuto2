# 住宅営業カルテ — 引き継ぎメモ（AI・開発者向け）

このファイルを最初に読ませてから編集を依頼してください。

## 1. 何のアプリか
ノークホームズ／フジタ／アッシュホームの3社向けの住宅営業管理アプリ。
顧客カルテ、面談記録、営業会議（毎週の打合わせシート）、申込・契約・没、集計（4月始まり年度）、
TODO、カレンダー、競合ノートを持つ。画面はすべて日本語。スマホ（iPhone）とPCの両方で使う。

## 2. ファイル構成（本体は1つ）
| ファイル | 役割 |
|---|---|
| `sales-crm.html` | **本体（唯一の編集対象）**。HTML+CSS+JS が1ファイル。`<!doctype>/<head>/<body>` は付けない（`<title>` から始まる） |
| `tools/build-web.py` | 本体から `docs/index.html`（ウェブ版）を生成。DB・ダウンロード・Googleカレンダーの差し替え（shim）を含む |
| `docs/index.html` | 生成物。**手で編集しない** |
| `docs/firebase-config.js` | Firebase の設定と Google OAuth クライアントID（利用者が貼る） |
| `docs/zip-jp.js`, `zip-jp.js` | 郵便番号→住所の表（`tools/build-zip.mjs` で生成） |
| `FIREBASE-SETUP.md` | 利用者向けの設定手順（Firebase・GitHub Pages・Googleカレンダー同期） |

**編集の流れ：** `sales-crm.html` を直す → `python3 tools/build-web.py` → 両方をコミット。

## 3. 2つの動き方
- **ウェブ版（本番の予定）**：GitHub Pages（`/docs`）＋ Firebase Firestore。Claude 不要。
  Firebase 未設定のときは「お試し版」（localStorage 保存・画面上部に茶色の帯）。
- **Claude 版**：claude.ai の Artifact として公開。AI機能（議事録・競合のAI下書き/要約）と Claude 経由の Googleカレンダーが使える。
  ChatGPT に移る場合は使わなくなる想定。

本体は `window.claude.use(name)` で外部機能を受け取る作り。ウェブ版では build-web.py の shim が同じ形で提供する：
- `use("db")` → `{doc(path), collection(name)}`。doc: `onSnapshot/set/update/delete`、collection: `onSnapshot/add`
- `use("downloads")` → `{save({filename,data})}`（CSV）
- `use("gcalsync")` → 個人Googleカレンダーへの一方向同期（GIS トークン＋Calendar REST）
- `use("sample")`, `use("mcp")` → ウェブ版では `null`（AI・Claude版カレンダーは非表示になる）

## 4. データ（Firestore のコレクション）
- `meta/config`：会社・商品カタログ（`companies[{id,name,short,productIds}]`, `catalog[{id,name,retired}]`）
- `meta/auth`：会社ごとの共通パスワード（salt＋SHA-256）。個人アカウントは無し
- `staff`：名簿 `{name, companies[], active}`
- `customers`：顧客。主な項目
  - `ownerId, companyId, rank(A/B/C), stage(reach/hearing/plan/estimate/closing)`
  - `meetings[{date,time,place,note}]`（配列の順番＝初回・2回目…）
  - `weekly{週の月曜日付:{plan,result,done}}`, `comments[]`, `goalDate`(契約目標日), `forecast`
  - `applied, appliedDate`（申込）, `contracted, contractDate, contractAmount`, `lost, lostReason`
  - `landStatus(searching/decided/own/none), landAddress …`, `loanScreen(none/applied/approved/main/rejected), bank`
  - `rivals[{id,name,sales,designer,attack,attackBy,attackAt,archivedAt}]`（競合と相手の担当・今の攻め方）
  - `followMode(""/on/off), followUntil`（要フォローの手動指定）
- `events`：予定（`type` は EVT の key、`staffId, date, startTime, endTime`）
- `todos`（`deleted` で論理削除）、`goals`（月別契約目標）、`mtgs`（営業会議の記録）
- `rivalNotes`：競合ノート（単価・性能などの項目、`tactics[]`＝過去の攻め手）
- `gsync/{staffId}`：Googleカレンダー同期の対応表 `{map:{key:{gid,h}}}`

## 5. 守ってほしいこと
- 画面の文言は**やさしい日本語**。専門用語や英語を出さない
- スマホ優先。900px以下は下部タブ、700px以下はカード表示。入力欄は16px（iPhoneの拡大防止）
- iPhone の日付ピッカーは癖がある（今日が勝手に入る・リセットで消えない）。日付欄には「消す」ボタンを自動付与済み、申込日は確定ボタン方式
- 色は `:root` の CSS 変数（ダークモード対応）。新しい色を直書きしない
- 年度は**4月始まり固定**
- 既存データとの互換：古い値は読み替えで残す（例 `STAGE_ALIAS`, `LAND_ALIAS`, 旧 `competitors` 文字列→`rivals`）
- Firestore ルールは現状「誰でも読み書き可」。URL を社外に出さない前提。パスワードは画面の仕分けでありデータの壁ではない

## 6. 動作確認のしかた
- 文法チェック：`<script>` の中身を取り出して `node --check`
- ウェブ版を手元で：`cd docs && python3 -m http.server 8765` → `http://localhost:8765/`（お試し版で動く）
- 初回はパスワード設定画面 → 会社を選んで名前とパスワードでログイン

## 7. 未完了・利用者の作業待ち
1. GitHub Pages：Settings → Pages → ブランチ `claude/housing-sales-crm-t7jmae`（または main に取り込んで main）・フォルダ `/docs`
2. Firebase の `firebaseConfig` を `docs/firebase-config.js` に貼る（共有データになる）
3. Googleカレンダー同期を使うなら OAuth クライアントIDを同ファイル末尾 `GOOGLE_CLIENT_ID` に貼る
4. 将来の候補：個人ログイン（Firebase Auth）化、Claude 版データのウェブ版への移行
