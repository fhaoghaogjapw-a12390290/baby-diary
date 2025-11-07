import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Bindings, Entry, ApiResponse } from './types'
import { calculateDayAge, calculateDateFromDayAge } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの提供
app.use('/static/*', serveStatic({ root: './' }))

// ===== API Routes =====

// 最新の記録を取得
app.get('/api/entries/latest', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM entries 
      ORDER BY entry_date DESC, person ASC 
      LIMIT 3
    `).all();

    return c.json<ApiResponse<Entry[]>>({
      success: true,
      data: results as Entry[]
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: String(error)
    }, 500);
  }
});

// 特定の日付の記録を取得
app.get('/api/entries/:date', async (c) => {
  try {
    const date = c.req.param('date');
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM entries 
      WHERE entry_date = ? 
      ORDER BY 
        CASE person 
          WHEN 'minato' THEN 1 
          WHEN 'araga' THEN 2 
          WHEN 'ryu' THEN 3 
        END
    `).bind(date).all();

    return c.json<ApiResponse<Entry[]>>({
      success: true,
      data: results as Entry[]
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: String(error)
    }, 500);
  }
});

// 日齢から日付の記録を取得
app.get('/api/entries/day/:dayAge', async (c) => {
  try {
    const dayAge = parseInt(c.req.param('dayAge'));
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM entries 
      WHERE day_age = ? 
      ORDER BY 
        CASE person 
          WHEN 'minato' THEN 1 
          WHEN 'araga' THEN 2 
          WHEN 'ryu' THEN 3 
        END
    `).bind(dayAge).all();

    return c.json<ApiResponse<Entry[]>>({
      success: true,
      data: results as Entry[]
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: String(error)
    }, 500);
  }
});

// 記録が存在する日付の一覧を取得
app.get('/api/entries/dates', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT entry_date, day_age, 
             COUNT(*) as entry_count
      FROM entries 
      GROUP BY entry_date
      ORDER BY entry_date DESC
    `).all();

    return c.json<ApiResponse>({
      success: true,
      data: results
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: String(error)
    }, 500);
  }
});

// 記録を投稿
app.post('/api/entries', async (c) => {
  try {
    const body = await c.req.parseBody();
    const entry_date = body.entry_date as string;
    const person = body.person as string;
    const title = body.title as string;
    const image = body.image as File;

    if (!entry_date || !person || !title || !image) {
      return c.json<ApiResponse>({
        success: false,
        error: '必須フィールドが不足しています'
      }, 400);
    }

    // 日齢を計算
    const day_age = calculateDayAge(entry_date);

    // 画像をR2にアップロード
    const imageKey = `${entry_date}/${person}/${Date.now()}-${image.name}`;
    await c.env.R2.put(imageKey, image);
    const image_url = `/api/images/${imageKey}`;

    // 既存のエントリーを確認
    const { results: existing } = await c.env.DB.prepare(`
      SELECT id FROM entries WHERE entry_date = ? AND person = ?
    `).bind(entry_date, person).all();

    let result;
    if (existing.length > 0) {
      // 更新
      result = await c.env.DB.prepare(`
        UPDATE entries 
        SET title = ?, image_url = ?, day_age = ?, updated_at = CURRENT_TIMESTAMP
        WHERE entry_date = ? AND person = ?
      `).bind(title, image_url, day_age, entry_date, person).run();
    } else {
      // 新規作成
      result = await c.env.DB.prepare(`
        INSERT INTO entries (entry_date, day_age, person, title, image_url)
        VALUES (?, ?, ?, ?, ?)
      `).bind(entry_date, day_age, person, title, image_url).run();
    }

    return c.json<ApiResponse>({
      success: true,
      data: { id: result.meta.last_row_id }
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: String(error)
    }, 500);
  }
});

// R2から画像を取得
app.get('/api/images/*', async (c) => {
  try {
    const key = c.req.path.replace('/api/images/', '');
    const object = await c.env.R2.get(key);

    if (!object) {
      return c.notFound();
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (error) {
    return c.notFound();
  }
});

// ユーザー認証（簡易版）
app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM users WHERE username = ?
    `).bind(username).all();

    if (results.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'ユーザー名またはパスワードが正しくありません'
      }, 401);
    }

    // 本番環境ではbcryptでハッシュ比較を行うべき
    // 今回は簡易的に固定パスワードで認証
    const validPasswords: Record<string, string> = {
      'minato_admin': 'minato123',
      'araga_user': 'araga123',
      'ryu_user': 'ryu123'
    };

    if (validPasswords[username] !== password) {
      return c.json<ApiResponse>({
        success: false,
        error: 'ユーザー名またはパスワードが正しくありません'
      }, 401);
    }

    const user = results[0] as any;

    // JWTトークンの代わりに簡易的なセッショントークンを返す
    const token = btoa(`${username}:${Date.now()}`);

    return c.json<ApiResponse>({
      success: true,
      data: {
        token,
        user: {
          username: user.username,
          display_name: user.display_name,
          person_id: user.person_id
        }
      }
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: String(error)
    }, 500);
  }
});

// ===== HTML Pages =====

// TOPページ
app.get('/', (c) => {
  const today = new Date();
  const currentDayAge = calculateDayAge(today);

  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>みなとの時間、ふたりの時間</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-pink-50 via-blue-50 to-green-50 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <!-- ヘッダー -->
            <header class="text-center mb-12">
                <h1 class="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
                    みなとの時間、ふたりの時間
                </h1>
                <p class="text-lg text-gray-600 mb-2">
                    同じ空の下、違う時間の流れ
                </p>
                <div class="inline-block bg-pink-100 rounded-full px-6 py-3 mt-4">
                    <p class="text-sm text-gray-700">
                        <i class="fas fa-baby mr-2"></i>
                        みなと 誕生日: 2025年11月7日
                    </p>
                    <p class="text-2xl font-bold text-pink-600 mt-2">
                        今日で生後 ${currentDayAge} 日目
                    </p>
                </div>
            </header>

            <!-- 最新の記録 -->
            <section class="mb-12">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">
                    <i class="fas fa-clock mr-2"></i>
                    最新の記録
                </h2>
                <div id="latest-entries" class="grid md:grid-cols-3 gap-6">
                    <div class="text-center text-gray-500 col-span-3">
                        読み込み中...
                    </div>
                </div>
            </section>

            <!-- ナビゲーションボタン -->
            <div class="flex flex-col md:flex-row gap-4 justify-center">
                <a href="/view" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-center transition duration-300 shadow-lg">
                    <i class="fas fa-calendar-alt mr-2"></i>
                    日記を見る
                </a>
                <a href="/post" class="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-lg text-center transition duration-300 shadow-lg">
                    <i class="fas fa-pen mr-2"></i>
                    今日の記録を投稿する
                </a>
            </div>
        </div>

        <script>
            // 最新の記録を取得
            fetch('/api/entries/latest')
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.data.length > 0) {
                        const container = document.getElementById('latest-entries');
                        const personColors = {
                            'minato': 'pink',
                            'araga': 'blue',
                            'ryu': 'green'
                        };
                        const personNames = {
                            'minato': 'みなと',
                            'araga': 'あらが',
                            'ryu': 'りゅう'
                        };
                        const personIcons = {
                            'minato': 'fa-baby',
                            'araga': 'fa-user',
                            'ryu': 'fa-user'
                        };

                        container.innerHTML = data.data.map(entry => {
                            const color = personColors[entry.person];
                            return \`
                                <div class="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition duration-300">
                                    <div class="bg-\${color}-100 p-4 border-b-4 border-\${color}-400">
                                        <h3 class="font-bold text-lg text-\${color}-800">
                                            <i class="fas \${personIcons[entry.person]} mr-2"></i>
                                            \${personNames[entry.person]}
                                        </h3>
                                        <p class="text-sm text-gray-600 mt-1">\${entry.entry_date}（みなと\${entry.day_age}日目）</p>
                                    </div>
                                    <img src="\${entry.image_url}" alt="\${entry.title}" class="w-full h-48 object-cover">
                                    <div class="p-4">
                                        <p class="text-center text-gray-800">\${entry.title}</p>
                                    </div>
                                </div>
                            \`;
                        }).join('');
                    }
                })
                .catch(err => console.error('Error loading entries:', err));
        </script>
    </body>
    </html>
  `);
});

// 閲覧ページ
app.get('/view', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>日記を見る - みなとの時間、ふたりの時間</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- ヘッダー -->
            <header class="mb-8">
                <div class="flex justify-between items-center">
                    <h1 class="text-3xl font-bold text-gray-800">
                        <i class="fas fa-book mr-2"></i>
                        タイムライン・ビューワー
                    </h1>
                    <a href="/" class="text-blue-500 hover:text-blue-700">
                        <i class="fas fa-home mr-1"></i>
                        TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- 日齢検索 -->
            <div class="bg-white rounded-lg shadow p-6 mb-8">
                <div class="flex items-center gap-4">
                    <label class="text-gray-700 font-bold">みなと</label>
                    <input type="number" id="dayAgeInput" min="1" placeholder="10" 
                           class="border border-gray-300 rounded px-4 py-2 w-24 text-center">
                    <label class="text-gray-700">日目へジャンプ</label>
                    <button onclick="jumpToDayAge()" 
                            class="bg-blue-500 hover:bg-blue-600 text-white font-bold px-6 py-2 rounded transition">
                        GO
                    </button>
                </div>
            </div>

            <!-- カレンダー -->
            <div class="bg-white rounded-lg shadow p-6 mb-8">
                <div class="flex justify-between items-center mb-4">
                    <button onclick="changeMonth(-1)" class="text-gray-600 hover:text-gray-800">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <h2 id="calendarTitle" class="text-xl font-bold text-gray-800"></h2>
                    <button onclick="changeMonth(1)" class="text-gray-600 hover:text-gray-800">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div id="calendar" class="grid grid-cols-7 gap-2"></div>
            </div>

            <!-- 記録表示エリア -->
            <div id="entriesArea" class="hidden">
                <div class="bg-gradient-to-r from-pink-100 to-blue-100 rounded-lg shadow p-6 mb-6 sticky top-0 z-10">
                    <h2 id="selectedDate" class="text-2xl font-bold text-gray-800 text-center"></h2>
                    <p id="selectedDayAge" class="text-xl text-pink-600 text-center mt-2"></p>
                </div>

                <div id="entriesCards" class="space-y-6">
                    <!-- 記録カードがここに表示される -->
                </div>

                <div class="flex justify-between mt-8">
                    <button onclick="navigateDay(-1)" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded">
                        <i class="fas fa-arrow-left mr-2"></i>
                        前の日
                    </button>
                    <button onclick="navigateDay(1)" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded">
                        次の日
                        <i class="fas fa-arrow-right ml-2"></i>
                    </button>
                </div>
            </div>
        </div>

        <script src="/static/view.js"></script>
    </body>
    </html>
  `);
});

// 投稿ページ
app.get('/post', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>記録を投稿 - みなとの時間、ふたりの時間</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <!-- ヘッダー -->
            <header class="mb-8">
                <div class="flex justify-between items-center">
                    <h1 class="text-3xl font-bold text-gray-800">
                        <i class="fas fa-pen mr-2"></i>
                        今日の記録を投稿
                    </h1>
                    <a href="/" class="text-blue-500 hover:text-blue-700">
                        <i class="fas fa-home mr-1"></i>
                        TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- ログインフォーム -->
            <div id="loginForm" class="bg-white rounded-lg shadow p-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">ログイン</h2>
                <form onsubmit="handleLogin(event)">
                    <div class="mb-4">
                        <label class="block text-gray-700 font-bold mb-2">ユーザー名</label>
                        <select id="username" class="w-full border border-gray-300 rounded px-4 py-2">
                            <option value="minato_admin">みなと</option>
                            <option value="araga_user">あらが</option>
                            <option value="ryu_user">りゅう</option>
                        </select>
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 font-bold mb-2">パスワード</label>
                        <input type="password" id="password" class="w-full border border-gray-300 rounded px-4 py-2">
                    </div>
                    <button type="submit" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded transition">
                        ログイン
                    </button>
                </form>
            </div>

            <!-- 投稿フォーム -->
            <div id="postForm" class="hidden">
                <div class="bg-white rounded-lg shadow p-8">
                    <div class="mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <span id="displayName"></span>の記録
                        </h2>
                        <button onclick="logout()" class="text-sm text-red-500 hover:text-red-700 mt-2">
                            ログアウト
                        </button>
                    </div>

                    <form onsubmit="handleSubmit(event)">
                        <div class="mb-6">
                            <label class="block text-gray-700 font-bold mb-2">日付</label>
                            <input type="date" id="entryDate" class="w-full border border-gray-300 rounded px-4 py-2" required>
                            <p id="dayAgeDisplay" class="text-sm text-gray-600 mt-2"></p>
                        </div>

                        <div class="mb-6">
                            <label class="block text-gray-700 font-bold mb-2">見出し（最大50文字）</label>
                            <input type="text" id="title" maxlength="50" class="w-full border border-gray-300 rounded px-4 py-2" required>
                        </div>

                        <div class="mb-6">
                            <label class="block text-gray-700 font-bold mb-2">画像（JPG/PNG、最大5MB）</label>
                            <input type="file" id="image" accept="image/jpeg,image/png" class="w-full border border-gray-300 rounded px-4 py-2" required>
                            <div id="imagePreview" class="mt-4 hidden">
                                <img id="previewImage" class="max-w-full h-auto rounded-lg shadow">
                            </div>
                        </div>

                        <button type="submit" id="submitBtn" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded transition">
                            投稿する
                        </button>
                    </form>
                </div>
            </div>

            <!-- メッセージエリア -->
            <div id="message" class="mt-4 hidden"></div>
        </div>

        <script src="/static/post.js"></script>
    </body>
    </html>
  `);
});

export default app
