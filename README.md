# tesuto2
LP7/10
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>蕪城小学校フェスタ - 楽しく防災を学ぼう</title>
    <style>
        :root {
            --primary-color: #ff6b6b;
            --secondary-color: #4ecdc4;
            --accent-color: #ffe66d;
            --text-color: #333333;
            --bg-color: #f8f9fa;
        }

        * {
            box-sizing: border-box;
        }

        body, html {
            margin: 0;
            padding: 0;
            font-family: 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            overflow-x: hidden;
        }

        /* アニメーション設定 */
        .fade-in {
            opacity: 0;
            transform: translateY(40px);
            transition: opacity 0.8s ease-out, transform 0.8s ease-out;
        }

        .fade-in.is-visible {
            opacity: 1;
            transform: translateY(0);
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }

        @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
            100% { transform: translateY(0px); }
        }

        /* ヒーローセクション */
        .hero {
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: linear-gradient(135deg, var(--primary-color), #ff8e53);
            color: white;
            text-align: center;
            padding: 0 20px;
            position: relative;
            overflow: hidden;
        }

        .hero::before {
            content: '';
            position: absolute;
            top: -50px;
            left: -50px;
            width: 200px;
            height: 200px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
        }

        .hero::after {
            content: '';
            position: absolute;
            bottom: -80px;
            right: -50px;
            width: 300px;
            height: 300px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
        }

        .hero .catchphrase {
            font-size: 1.5rem;
            font-weight: bold;
            background-color: rgba(255, 255, 255, 0.2);
            padding: 10px 30px;
            border-radius: 50px;
            margin-bottom: 20px;
            backdrop-filter: blur(5px);
            animation: float 4s ease-in-out infinite;
        }

        .hero h1 {
            font-size: 4rem;
            margin: 0;
            text-shadow: 2px 4px 8px rgba(0,0,0,0.2);
            line-height: 1.2;
        }

        .hero .date {
            font-size: 1.8rem;
            margin-top: 40px;
            font-weight: bold;
            background: white;
            color: var(--primary-color);
            padding: 15px 40px;
            border-radius: 40px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
            animation: pulse 2s infinite;
        }

        /* 共通セクションスタイル */
        section {
            padding: 80px 20px;
            max-width: 1000px;
            margin: 0 auto;
        }

        h2 {
            text-align: center;
            font-size: 2.5rem;
            color: var(--primary-color);
            margin-bottom: 50px;
            position: relative;
        }

        h2::after {
            content: '';
            display: block;
            width: 80px;
            height: 5px;
            background-color: var(--secondary-color);
            margin: 15px auto 0;
            border-radius: 3px;
        }

        /* プレースホルダー画像 */
        .placeholder {
            background-color: #e0e0e0;
            width: 100%;
            height: 300px;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #777777;
            font-size: 1.2rem;
            font-weight: bold;
            border-radius: 15px;
            border: 2px dashed #bbbbbb;
            margin: 20px 0;
            transition: transform 0.3s ease;
        }

        .placeholder:hover {
            transform: scale(1.02);
        }

        /* 祭りの特徴 */
        .features-grid {
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
            justify-content: center;
        }

        .feature-card {
            background: white;
            padding: 40px 30px;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            flex: 1;
            min-width: 260px;
            text-align: center;
            position: relative;
            overflow: hidden;
            border-top: 5px solid var(--secondary-color);
        }

        .feature-card h3 {
            color: var(--text-color);
            font-size: 1.5rem;
            margin-bottom: 15px;
        }

        /* イベントスケジュール・出し物 */
        .event-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 40px;
        }

        .event-item {
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .event-item:hover {
            transform: translateY(-10px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.12);
        }

        .event-item .placeholder {
            margin: 0;
            border-radius: 20px 20px 0 0;
            border: none;
            height: 220px;
        }

        .event-item .content {
            padding: 30px;
            text-align: center;
        }

        .event-item h3 {
            margin: 0 0 15px 0;
            color: var(--primary-color);
            font-size: 1.6rem;
        }

        .event-item p {
            line-height: 1.6;
            color: #555;
        }

        /* アクセス情報 */
        .access-info {
            background: white;
            padding: 50px;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            text-align: center;
        }

        .access-info p {
            font-size: 1.3rem;
            margin: 15px 0;
        }

        /* フッター */
        footer {
            background-color: #2c3e50;
            color: white;
            text-align: center;
            padding: 50px 20px;
            margin-top: 40px;
        }

        footer p {
            margin: 10px 0;
            font-size: 1.1rem;
        }

        /* レスポンシブ対応 */
        @media (max-width: 768px) {
            .hero h1 { font-size: 2.5rem; }
            .hero .catchphrase { font-size: 1.1rem; }
            .hero .date { font-size: 1.3rem; padding: 12px 30px; }
            section { padding: 60px 20px; }
            h2 { font-size: 2rem; }
            .placeholder { height: 200px; }
        }
    </style>
</head>
<body>

    <!-- ヘッダー（ヒーローセクション） -->
    <header class="hero">
        <div class="catchphrase">楽しく防災を学ぼう</div>
        <h1>蕪城小学校フェスタ</h1>
        <div class="date">令和8年10月27日 開催</div>
    </header>

    <!-- 祭りの特徴 -->
    <section id="features" class="fade-in">
        <h2>祭りの特徴</h2>
        <div class="features-grid">
            <div class="feature-card">
                <h3>対象</h3>
                <p>蕪城小学校生徒及びご家族の皆様にご参加いただけます。</p>
            </div>
            <div class="feature-card">
                <h3>参加費</h3>
                <p>参加条件は「無料」です。ご家族皆様でお気軽にご来場ください。</p>
            </div>
            <div class="feature-card">
                <h3>歴史</h3>
                <p>地域の皆様に愛され「毎年開催」されている恒例のイベントです。</p>
            </div>
        </div>
        <div style="margin-top: 40px;">
            <div class="placeholder">ここに祭りの全体風景などの画像</div>
        </div>
    </section>

    <!-- イベントスケジュール・出し物 -->
    <section id="events" class="fade-in">
        <h2>イベント・出し物</h2>
        <div class="event-list">
            <div class="event-item">
                <div class="placeholder">ここに自衛隊の展示・体験画像</div>
                <div class="content">
                    <h3>自衛隊</h3>
                    <p>災害時に活躍する車両の展示や、防災に関する貴重な体験ブースをご用意しています。</p>
                </div>
            </div>
            <div class="event-item">
                <div class="placeholder">ここに消防の展示・体験画像</div>
                <div class="content">
                    <h3>消防</h3>
                    <p>消防車両の展示や、実践的な防災を学べる体験コーナーを通じて楽しく学びます。</p>
                </div>
            </div>
            <div class="event-item">
                <div class="placeholder">ここに建設業企業の展示・体験画像</div>
                <div class="content">
                    <h3>建設業企業</h3>
                    <p>街のインフラを守る建設機械の展示など、迫力ある体験が待っています。</p>
                </div>
            </div>
        </div>
    </section>

    <!-- アクセス情報 -->
    <section id="access" class="fade-in">
        <h2>アクセス情報</h2>
        <div class="access-info">
            <p><strong>【開催場所】</strong> 蕪城小学校</p>
            <p><strong>【駐車場】</strong> 小学校駐車場をご利用いただけます</p>
            <div class="placeholder" style="margin-top: 30px;">
                ここにアクセスマップ（地図）の画像
            </div>
        </div>
    </section>

    <!-- フッター -->
    <footer>
        <p>【お問い合わせ先】</p>
        <p>担当：藤田</p>
        <p style="margin-top: 30px; font-size: 0.9rem; color: #aaaaaa;">&copy; 令和8年 蕪城小学校フェスタ</p>
    </footer>

    <!-- スクロールアニメーション用JavaScript -->
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const observerOptions = {
                root: null,
                rootMargin: '0px',
                threshold: 0.2
            };

            const observer = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, observerOptions);

            const fadeElements = document.querySelectorAll('.fade-in');
            fadeElements.forEach(el => {
                observer.observe(el);
            });
        });
    </script>

</body>
</html>
