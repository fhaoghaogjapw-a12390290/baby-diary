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
    // まずすべてのエントリを取得
    const { results: allEntries } = await c.env.DB.prepare(`
      SELECT * FROM entries ORDER BY entry_date DESC
    `).all();
    
    // 日付ごとにグループ化
    const dateMap = new Map();
    for (const entry of allEntries as Entry[]) {
      if (!dateMap.has(entry.entry_date)) {
        dateMap.set(entry.entry_date, {
          entry_date: entry.entry_date,
          day_age: entry.day_age,
          entry_count: 0
        });
      }
      const dateInfo = dateMap.get(entry.entry_date);
      dateInfo.entry_count++;
    }
    
    const results = Array.from(dateMap.values()).sort((a, b) => 
      b.entry_date.localeCompare(a.entry_date)
    );

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
    <body class="bg-gradient-to-br from-red-50 via-white to-red-50 min-h-screen">
        <!-- 日の丸装飾 -->
        <div class="fixed top-8 right-8 w-24 h-24 bg-red-600 rounded-full opacity-20 pointer-events-none z-0"></div>
        <div class="fixed bottom-8 left-8 w-32 h-32 bg-red-600 rounded-full opacity-10 pointer-events-none z-0"></div>
        
        <div class="container mx-auto px-4 py-12 relative z-10">
            <!-- ヘッダー -->
            <header class="text-center mb-16">
                <div class="mb-8">
                    <h1 class="text-5xl md:text-7xl font-bold text-red-700 mb-4" style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.1em;">
                        みなととおれらの成長記録
                    </h1>
                    <div class="w-32 h-1 bg-red-600 mx-auto mb-6"></div>
                    <p class="text-3xl text-gray-700 font-bold" style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.2em;">
                        誇り高き日本を作ろう
                    </p>
                </div>
                <div class="inline-block bg-white rounded-2xl px-10 py-6 mt-6 border-2 border-red-600 shadow-xl">
                    <p class="text-xl text-gray-700 font-bold mb-2">
                        みなと 誕生日: 2025年11月7日
                    </p>
                    <p class="text-4xl font-black text-red-600 mt-3">
                        生後 ${currentDayAge} 日目
                    </p>
                </div>
            </header>

            <!-- 最新の記録 -->
            <section class="mb-12">
                <h2 class="text-3xl font-bold text-red-700 mb-8 text-center border-b-4 border-red-600 pb-4 inline-block w-full" style="font-family: 'Noto Serif JP', serif;">
                    直近で更新された記録
                </h2>
                <div id="latest-entries" class="grid md:grid-cols-3 gap-6">
                    <div class="text-center text-gray-500 col-span-3">
                        読み込み中...
                    </div>
                </div>
            </section>

            <!-- ナビゲーションボタン -->
            <div class="flex flex-col md:flex-row gap-6 justify-center mt-12">
                <a href="/view" class="bg-red-600 hover:bg-red-700 text-white font-bold py-6 px-12 text-center transition duration-300 shadow-lg text-xl border-2 border-red-800" style="font-family: 'Noto Serif JP', serif;">
                    日記を見る
                </a>
                <a href="/post" class="bg-white hover:bg-gray-50 text-red-600 font-bold py-6 px-12 text-center transition duration-300 shadow-lg text-xl border-2 border-red-600" style="font-family: 'Noto Serif JP', serif;">
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

                        const emojis = {
                            'minato': '👶',
                            'araga': '🎸',
                            'ryu': '🎯'
                        };
                        
                        // あらが→みなと→りゅうの順番に並び替え
                        const personOrder = ['araga', 'minato', 'ryu'];
                        const sortedData = data.data.sort((a, b) => {
                            return personOrder.indexOf(a.person) - personOrder.indexOf(b.person);
                        });
                        
                        container.innerHTML = sortedData.map(entry => {
                            const color = personColors[entry.person];
                            return \`
                                <div class="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition duration-300 border-2 border-\${color}-400">
                                    <div class="bg-\${color}-100 p-6 border-b-2 border-\${color}-400">
                                        <h3 class="font-bold text-2xl text-\${color}-800 text-center" style="font-family: 'Noto Serif JP', serif;">
                                            \${emojis[entry.person]} \${personNames[entry.person]}
                                        </h3>
                                        <p class="text-sm text-gray-600 mt-2 text-center">\${entry.entry_date}（みなと\${entry.day_age}日目）</p>
                                    </div>
                                    <img src="\${entry.image_url}" alt="\${entry.title}" class="w-full h-64 object-cover">
                                    <div class="p-6 bg-gray-50">
                                        <p class="text-center text-xl font-bold text-gray-800" style="font-family: 'Noto Serif JP', serif;">\${entry.title}</p>
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
    <body class="bg-gradient-to-br from-red-50 via-white to-red-50 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- ヘッダー -->
            <header class="mb-8">
                <div class="flex justify-between items-center">
                    <h1 class="text-4xl font-bold text-red-700" style="font-family: 'Noto Serif JP', serif;">
                        すべての記録
                    </h1>
                    <a href="/" class="text-red-600 hover:text-red-800 font-bold text-xl" style="font-family: 'Noto Serif JP', serif;">
                        TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- すべての記録を表示 -->
            <div id="allEntriesArea">
                <div class="text-center text-gray-500 py-8">
                    読み込み中...
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
    <body class="bg-gradient-to-br from-red-50 via-white to-red-50 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <!-- ヘッダー -->
            <header class="mb-8">
                <div class="flex justify-between items-center">
                    <h1 class="text-4xl font-bold text-red-700" style="font-family: 'Noto Serif JP', serif;">
                        今日の記録を投稿
                    </h1>
                    <a href="/" class="text-red-600 hover:text-red-800 font-bold text-xl" style="font-family: 'Noto Serif JP', serif;">
                        TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- ユーザー選択フォーム -->
            <div id="selectForm" class="bg-white rounded-lg shadow-xl p-8 border-2 border-red-600">
                <h2 class="text-3xl font-bold text-red-700 mb-8 text-center border-b-2 border-red-600 pb-4" style="font-family: 'Noto Serif JP', serif;">誰の記録？</h2>
                <form onsubmit="handleUserSelect(event)">
                    <div class="mb-6">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <button type="button" onclick="selectUser('minato')" class="user-select-btn bg-pink-100 hover:bg-pink-200 text-pink-800 font-bold py-10 px-6 transition duration-300 shadow-lg border-2 border-pink-400 hover:border-pink-600">
                                <div class="text-7xl mb-3">👶</div>
                                <div class="text-2xl" style="font-family: 'Noto Serif JP', serif;">みなと</div>
                            </button>
                            <button type="button" onclick="selectUser('araga')" class="user-select-btn bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold py-10 px-6 transition duration-300 shadow-lg border-2 border-blue-400 hover:border-blue-600">
                                <div class="text-7xl mb-3">🎸</div>
                                <div class="text-2xl" style="font-family: 'Noto Serif JP', serif;">あらが</div>
                            </button>
                            <button type="button" onclick="selectUser('ryu')" class="user-select-btn bg-green-100 hover:bg-green-200 text-green-800 font-bold py-10 px-6 transition duration-300 shadow-lg border-2 border-green-400 hover:border-green-600">
                                <div class="text-7xl mb-3">🎯</div>
                                <div class="text-2xl" style="font-family: 'Noto Serif JP', serif;">りゅう</div>
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <!-- 投稿フォーム -->
            <div id="postForm" class="hidden">
                <div class="bg-white rounded-lg shadow-xl p-8 border-2 border-red-600">
                    <div class="mb-6 flex justify-between items-center border-b-2 border-red-600 pb-4">
                        <h2 class="text-3xl font-bold text-red-700" style="font-family: 'Noto Serif JP', serif;">
                            <span id="displayEmoji"></span> <span id="displayName"></span>の記録
                        </h2>
                        <button onclick="logout()" class="text-lg text-gray-600 hover:text-gray-800 font-bold" style="font-family: 'Noto Serif JP', serif;">
                            別の人に変更
                        </button>
                    </div>

                    <form onsubmit="handleSubmit(event)">
                        <div class="mb-6">
                            <label class="block text-gray-700 font-bold mb-2 text-lg" style="font-family: 'Noto Serif JP', serif;">日付</label>
                            <input type="date" id="entryDate" class="w-full border-2 border-gray-300 rounded px-4 py-3 text-lg focus:border-red-600 focus:ring-2 focus:ring-red-200" required>
                            <p id="dayAgeDisplay" class="text-lg text-red-600 mt-2 font-bold"></p>
                        </div>

                        <div class="mb-6">
                            <label class="block text-gray-700 font-bold mb-2 text-lg" style="font-family: 'Noto Serif JP', serif;">見出し（最大50文字）</label>
                            <input type="text" id="title" maxlength="50" class="w-full border-2 border-gray-300 rounded px-4 py-3 text-lg focus:border-red-600 focus:ring-2 focus:ring-red-200" required placeholder="今日の出来事を一言で">
                        </div>

                        <div class="mb-6">
                            <label class="block text-gray-700 font-bold mb-2 text-lg" style="font-family: 'Noto Serif JP', serif;">画像（JPG/PNG、最大5MB）</label>
                            <input type="file" id="image" accept="image/jpeg,image/png" class="w-full border-2 border-gray-300 rounded px-4 py-3 bg-white focus:border-red-600" required>
                            <div id="imagePreview" class="mt-4 hidden">
                                <img id="previewImage" class="max-w-full h-auto rounded shadow-lg border-2 border-gray-300">
                            </div>
                        </div>

                        <div class="flex gap-4">
                            <button type="submit" id="submitBtn" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-8 transition duration-300 shadow-lg text-xl border-2 border-red-800" style="font-family: 'Noto Serif JP', serif;">
                                投稿する
                            </button>
                            <button type="button" id="editBtn" onclick="loadExistingEntry()" class="bg-white hover:bg-gray-50 text-red-600 font-bold py-4 px-8 transition duration-300 shadow-lg text-xl border-2 border-red-600 hidden" style="font-family: 'Noto Serif JP', serif;">
                                既存の記録を編集
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
