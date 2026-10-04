/* ============================================================
   Firebase の設定をここに貼り付けてください。
   Firebase コンソール →（歯車）プロジェクトの設定 → マイアプリ → ウェブアプリ
   に表示される firebaseConfig の中身を、そのまま置き換えます。

   ここに書く値は公開されても問題のない種類のものです（ブラウザに配られます）。
   データを守るのは Firestore のルールです。FIREBASE-SETUP.md をご覧ください。
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey:            "ここにapiKeyを貼る",
  authDomain:        "ここにauthDomainを貼る",
  projectId:         "ここにprojectIdを貼る",
  storageBucket:     "ここにstorageBucketを貼る",
  messagingSenderId: "ここにmessagingSenderIdを貼る",
  appId:             "ここにappIdを貼る"
};

/* ============================================================
   自分のGoogleカレンダーへの同期を使うときだけ、下に「OAuth クライアントID」を貼ります。
   Google Cloud コンソール → Google Auth Platform（APIとサービス）→ クライアント
   で作った「ウェブアプリケーション」のクライアントID（～.apps.googleusercontent.com）です。
   これも公開されて問題のない値です。手順は FIREBASE-SETUP.md の「Googleカレンダー同期」。
   ============================================================ */
window.GOOGLE_CLIENT_ID = "ここにクライアントIDを貼る";
