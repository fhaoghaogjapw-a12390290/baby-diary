import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Bindings, Entry, ApiResponse } from './types'
import { calculateDayAgeFromDate, calculateDateFromDayAge } from './utils/date'

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの提供
app.use('/static/*', serveStatic({ root: './' }))

// ===== API Routes =====

// 最新の記録を取得（更新日時順）
app.get('/api/entries/latest', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM entries 
      ORDER BY updated_at DESC
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
    const day_age = calculateDayAgeFromDate(entry_date);

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

// ユーザー選択（パスワード不要）
app.post('/api/auth/select', async (c) => {
  try {
    const { person_id } = await c.req.json();

    if (!person_id || !['minato', 'araga', 'ryu'].includes(person_id)) {
      return c.json<ApiResponse>({
        success: false,
        error: '無効なユーザーです'
      }, 400);
    }

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM users WHERE person_id = ?
    `).bind(person_id).all();

    if (results.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'ユーザーが見つかりません'
      }, 404);
    }

    const user = results[0] as any;

    return c.json<ApiResponse>({
      success: true,
      data: {
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
  const today = new Date().toISOString().split('T')[0];
  const currentDayAge = calculateDayAgeFromDate(today);

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
    <body class="bg-gradient-to-br from-red-100 via-yellow-100 to-orange-100 min-h-screen">
        <!-- 祭り装飾 -->
        <div class="fixed top-0 left-0 right-0 pointer-events-none z-50">
            <div class="text-4xl animate-bounce" style="animation-duration: 2s;">
                🎊🎉🎊🎉🎊🎉🎊🎉🎊🎉🎊🎉
            </div>
        </div>
        
        <div class="container mx-auto px-4 py-12">
            <!-- ヘッダー -->
            <header class="text-center mb-12 relative">
                <div class="inline-block relative">
                    <h1 class="text-4xl md:text-6xl font-bold text-red-600 mb-4 drop-shadow-lg" style="text-shadow: 3px 3px 0px #FFD700, 6px 6px 0px #FF6B6B;">
                        🎪 みなとの時間、ふたりの時間 🎪
                    </h1>
                    <div class="absolute -top-8 -right-8 text-6xl animate-spin" style="animation-duration: 3s;">🎡</div>
                    <div class="absolute -top-8 -left-8 text-6xl animate-bounce" style="animation-duration: 1.5s;">🎈</div>
                </div>
                <p class="text-2xl text-orange-700 mb-4 font-bold">
                    🌟 わいわい！がやがや！三人祭り 🌟
                </p>
                <div class="inline-block bg-gradient-to-r from-pink-200 to-yellow-200 rounded-3xl px-8 py-4 mt-4 border-4 border-red-400 shadow-2xl transform hover:scale-105 transition">
                    <p class="text-lg text-red-700 font-bold">
                        🎂 みなと 誕生日: 2025年11月7日 🎂
                    </p>
                    <p class="text-3xl font-black text-red-600 mt-2 animate-pulse">
                        🎉 今日で生後 ${currentDayAge} 日目 🎉
                    </p>
                </div>
            </header>

            <!-- 最新の記録 -->
            <section class="mb-12">
                <h2 class="text-3xl font-bold text-red-600 mb-6 text-center drop-shadow-lg">
                    <i class="fas fa-fire mr-2"></i>
                    🔥 直近で更新された記録 🔥
                    <i class="fas fa-fire ml-2"></i>
                </h2>
                <div id="latest-entries" class="grid md:grid-cols-3 gap-6">
                    <div class="text-center text-gray-500 col-span-3">
                        読み込み中...
                    </div>
                </div>
            </section>

            <!-- ナビゲーションボタン -->
            <div class="flex flex-col md:flex-row gap-6 justify-center">
                <a href="/view" class="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-6 px-10 rounded-full text-center transition duration-300 shadow-2xl text-xl transform hover:scale-110 border-4 border-white">
                    <i class="fas fa-book-open mr-2"></i>
                    📖 日記を見る 📖
                </a>
                <a href="/post" class="bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white font-bold py-6 px-10 rounded-full text-center transition duration-300 shadow-2xl text-xl transform hover:scale-110 border-4 border-white animate-pulse">
                    <i class="fas fa-pen-fancy mr-2"></i>
                    ✨ 今日の記録を投稿する ✨
                </a>
            </div>
        </div>
        
        <!-- 下部装飾 -->
        <div class="fixed bottom-0 left-0 right-0 pointer-events-none z-50">
            <div class="text-4xl">
                🎪🎨🎭🎪🎨🎭🎪🎨🎭🎪🎨🎭
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

                        const emojis = {
                            'minato': '👶',
                            'araga': '🎸',
                            'ryu': '🎯'
                        };
                        
                        container.innerHTML = data.data.map(entry => {
                            const color = personColors[entry.person];
                            return \`
                                <div class="bg-gradient-to-br from-\${color}-100 to-\${color}-200 rounded-2xl shadow-2xl overflow-hidden hover:shadow-3xl transition duration-300 transform hover:scale-105 border-4 border-\${color}-400">
                                    <div class="bg-gradient-to-r from-\${color}-400 to-\${color}-500 p-4 border-b-4 border-\${color}-600">
                                        <h3 class="font-black text-2xl text-white drop-shadow-lg">
                                            \${emojis[entry.person]} \${personNames[entry.person]} \${emojis[entry.person]}
                                        </h3>
                                        <p class="text-sm text-\${color}-100 mt-1 font-bold">📅 \${entry.entry_date}（みなと\${entry.day_age}日目）</p>
                                    </div>
                                    <img src="\${entry.image_url}" alt="\${entry.title}" class="w-full h-56 object-cover border-4 border-\${color}-300">
                                    <div class="p-6 bg-white">
                                        <p class="text-center text-xl font-bold text-gray-800">✨ \${entry.title} ✨</p>
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
    <body class="bg-gradient-to-br from-purple-100 via-pink-100 to-orange-100 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- ヘッダー -->
            <header class="mb-8">
                <div class="flex justify-between items-center">
                    <h1 class="text-4xl font-bold text-purple-600 drop-shadow-lg">
                        <i class="fas fa-book-open mr-2"></i>
                        📚 タイムライン・ビューワー 📚
                    </h1>
                    <a href="/" class="text-blue-600 hover:text-blue-800 font-bold text-xl">
                        <i class="fas fa-home mr-1"></i>
                        🏠 TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- 日齢検索 -->
            <div class="bg-gradient-to-r from-yellow-200 to-orange-200 rounded-3xl shadow-2xl p-6 mb-8 border-4 border-orange-400">
                <div class="flex flex-wrap items-center gap-4 justify-center">
                    <label class="text-orange-700 font-bold text-xl">🎯 みなと</label>
                    <input type="number" id="dayAgeInput" min="1" placeholder="10" 
                           class="border-4 border-orange-400 rounded-xl px-4 py-2 w-24 text-center text-xl font-bold focus:border-orange-600">
                    <label class="text-orange-700 font-bold text-xl">日目へジャンプ</label>
                    <button onclick="jumpToDayAge()" 
                            class="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white font-bold px-8 py-3 rounded-full transition transform hover:scale-110 shadow-xl border-4 border-white text-xl">
                        🚀 GO 🚀
                    </button>
                </div>
            </div>

            <!-- カレンダー -->
            <div class="bg-gradient-to-br from-white to-pink-50 rounded-3xl shadow-2xl p-6 mb-8 border-4 border-purple-400">
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
                <div class="bg-gradient-to-r from-pink-300 via-yellow-200 to-orange-300 rounded-3xl shadow-2xl p-6 mb-6 sticky top-0 z-10 border-4 border-red-400">
                    <h2 id="selectedDate" class="text-3xl font-bold text-red-600 text-center drop-shadow-lg"></h2>
                    <p id="selectedDayAge" class="text-2xl text-pink-700 text-center mt-2 font-bold"></p>
                </div>

                <div id="entriesCards" class="space-y-8">
                    <!-- 記録カードがここに表示される -->
                </div>

                <div class="flex justify-between mt-8">
                    <button onclick="navigateDay(-1)" class="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-full transform hover:scale-110 transition shadow-xl border-4 border-white text-xl">
                        <i class="fas fa-arrow-left mr-2"></i>
                        ⏮️ 前の日
                    </button>
                    <button onclick="navigateDay(1)" class="bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white font-bold py-4 px-8 rounded-full transform hover:scale-110 transition shadow-xl border-4 border-white text-xl">
                        次の日 ⏭️
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
    <body class="bg-gradient-to-br from-yellow-100 via-orange-100 to-red-100 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <!-- ヘッダー -->
            <header class="mb-8">
                <div class="flex justify-between items-center">
                    <h1 class="text-4xl font-bold text-red-600 drop-shadow-lg">
                        <i class="fas fa-pen-fancy mr-2"></i>
                        ✨ 今日の記録を投稿 ✨
                    </h1>
                    <a href="/" class="text-blue-600 hover:text-blue-800 font-bold text-xl">
                        <i class="fas fa-home mr-1"></i>
                        🏠 TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- ユーザー選択フォーム -->
            <div id="selectForm" class="bg-gradient-to-br from-pink-200 to-yellow-200 rounded-3xl shadow-2xl p-8 border-4 border-red-400">
                <h2 class="text-3xl font-bold text-red-600 mb-6 text-center">🎭 誰の記録？ 🎭</h2>
                <form onsubmit="handleUserSelect(event)">
                    <div class="mb-6">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <button type="button" onclick="selectUser('minato')" class="user-select-btn bg-gradient-to-br from-pink-300 to-pink-500 hover:from-pink-400 hover:to-pink-600 text-white font-bold py-8 px-6 rounded-2xl transition duration-300 transform hover:scale-110 shadow-xl border-4 border-pink-600">
                                <div class="text-6xl mb-2">👶</div>
                                <div class="text-2xl">みなと</div>
                            </button>
                            <button type="button" onclick="selectUser('araga')" class="user-select-btn bg-gradient-to-br from-blue-300 to-blue-500 hover:from-blue-400 hover:to-blue-600 text-white font-bold py-8 px-6 rounded-2xl transition duration-300 transform hover:scale-110 shadow-xl border-4 border-blue-600">
                                <div class="text-6xl mb-2">🎸</div>
                                <div class="text-2xl">あらが</div>
                            </button>
                            <button type="button" onclick="selectUser('ryu')" class="user-select-btn bg-gradient-to-br from-green-300 to-green-500 hover:from-green-400 hover:to-green-600 text-white font-bold py-8 px-6 rounded-2xl transition duration-300 transform hover:scale-110 shadow-xl border-4 border-green-600">
                                <div class="text-6xl mb-2">🎯</div>
                                <div class="text-2xl">りゅう</div>
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <!-- 投稿フォーム -->
            <div id="postForm" class="hidden">
                <div class="bg-gradient-to-br from-white to-yellow-50 rounded-3xl shadow-2xl p-8 border-4 border-orange-400">
                    <div class="mb-6 flex justify-between items-center">
                        <h2 class="text-3xl font-bold text-orange-600">
                            <span id="displayEmoji"></span> <span id="displayName"></span>の記録 <span id="displayEmoji2"></span>
                        </h2>
                        <button onclick="logout()" class="text-lg text-red-600 hover:text-red-800 font-bold">
                            🔄 別の人に変更
                        </button>
                    </div>

                    <form onsubmit="handleSubmit(event)">
                        <div class="mb-6">
                            <label class="block text-orange-700 font-bold mb-2 text-xl">📅 日付</label>
                            <input type="date" id="entryDate" class="w-full border-4 border-orange-300 rounded-xl px-4 py-3 text-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-300" required>
                            <p id="dayAgeDisplay" class="text-lg text-orange-600 mt-2 font-bold"></p>
                        </div>

                        <div class="mb-6">
                            <label class="block text-orange-700 font-bold mb-2 text-xl">✍️ 見出し（最大50文字）</label>
                            <input type="text" id="title" maxlength="50" class="w-full border-4 border-orange-300 rounded-xl px-4 py-3 text-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-300" required placeholder="今日の出来事を一言で！">
                        </div>

                        <div class="mb-6">
                            <label class="block text-orange-700 font-bold mb-2 text-xl">📸 画像（JPG/PNG、最大5MB）</label>
                            <input type="file" id="image" accept="image/jpeg,image/png" class="w-full border-4 border-orange-300 rounded-xl px-4 py-3 bg-white focus:border-orange-500" required>
                            <div id="imagePreview" class="mt-4 hidden">
                                <img id="previewImage" class="max-w-full h-auto rounded-2xl shadow-2xl border-4 border-orange-400">
                            </div>
                        </div>

                        <div class="flex gap-4">
                            <button type="submit" id="submitBtn" class="flex-1 bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white font-bold py-4 px-8 rounded-full transition duration-300 shadow-xl text-xl transform hover:scale-105 border-4 border-white">
                                🎉 投稿する 🎉
                            </button>
                            <button type="button" id="editBtn" onclick="loadExistingEntry()" class="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-full transition duration-300 shadow-xl text-xl transform hover:scale-105 border-4 border-white hidden">
                                ✏️ 既存の記録を編集
                            </button>
                        </div>
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
