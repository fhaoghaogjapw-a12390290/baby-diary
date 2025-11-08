import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Bindings, Entry, ApiResponse } from './types'
import { calculateDayAgeFromDate, calculateDateFromDayAge, calculateAragaDayAge } from './utils/date'

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの提供
app.use('/static/*', serveStatic({ root: './' }))

// ===== API Routes =====

// 最新の記録を取得（各人1つずつ、計2件）
app.get('/api/entries/latest', async (c) => {
  try {
    // 各人の最新記録を1つずつ取得
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY person ORDER BY updated_at DESC) as rn
        FROM entries
      ) WHERE rn = 1
      ORDER BY 
        CASE person 
          WHEN 'minato' THEN 1 
          WHEN 'araga' THEN 2 
        END
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

// 記録を削除
app.delete('/api/entries/:date/:person', async (c) => {
  try {
    const date = c.req.param('date');
    const person = c.req.param('person');

    // 削除前に画像URLを取得
    const { results } = await c.env.DB.prepare(`
      SELECT image_url FROM entries WHERE entry_date = ? AND person = ?
    `).bind(date, person).all();

    if (results.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: '記録が見つかりません'
      }, 404);
    }

    const entry = results[0] as Entry;

    // R2から画像を削除
    if (entry.image_url && entry.image_url.startsWith('/api/images/')) {
      const imageKey = entry.image_url.replace('/api/images/', '');
      await c.env.R2.delete(imageKey);
    }

    // データベースから削除
    await c.env.DB.prepare(`
      DELETE FROM entries WHERE entry_date = ? AND person = ?
    `).bind(date, person).run();

    return c.json<ApiResponse>({
      success: true,
      message: '記録を削除しました'
    });
  } catch (error) {
    return c.json<ApiResponse>({
      success: false,
      error: String(error)
    }, 500);
  }
});

// ユーザー選択（パスワード不要）
app.post('/api/auth/select', async (c) => {
  try {
    const { person_id } = await c.req.json();

    if (!person_id || !['minato', 'araga'].includes(person_id)) {
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
  const currentAragaDayAge = calculateAragaDayAge(today);

  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>みなととあらがの成長記録</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="min-h-screen" style="background: linear-gradient(135deg, #2c5a5a 0%, #1a3d3d 100%);">
        <!-- パスワード認証画面 -->
        <div id="authScreen" class="fixed inset-0 flex items-center justify-center z-50" style="background: linear-gradient(135deg, #2c5a5a 0%, #1a3d3d 100%);">
            <!-- 日の丸背景 -->
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600 rounded-full opacity-20"></div>
            
            <div class="relative bg-amber-50 shadow-2xl p-6 sm:p-12 max-w-md w-full mx-4 border-4 sm:border-8" style="border-color: #8B4513; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                <h1 class="text-3xl sm:text-5xl font-bold mb-6 sm:mb-8 text-center" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.2em;">
                    みなととあらがの<br>成長記録
                </h1>
                <div class="w-20 h-20 sm:w-24 sm:h-24 bg-red-600 rounded-full mx-auto mb-6 sm:mb-8 shadow-lg"></div>
                <form onsubmit="checkPassword(event)">
                    <label class="block font-bold mb-4 text-lg sm:text-xl text-center" style="font-family: 'Noto Serif JP', serif; color: #8B4513;">
                        パスワードを入力
                    </label>
                    <input type="password" id="passwordInput" 
                           class="w-full border-2 sm:border-4 px-4 py-2 sm:py-3 text-base sm:text-lg text-center mb-4 sm:mb-6 bg-white" 
                           style="border-color: #8B4513; font-family: 'Noto Serif JP', serif;"
                           placeholder="パスワード" required>
                    <button type="submit" 
                            class="w-full text-white font-bold py-3 sm:py-4 px-6 sm:px-8 transition duration-300 shadow-lg text-lg sm:text-xl border-2 sm:border-4"
                            style="background-color: #8B4513; border-color: #654321; font-family: 'Noto Serif JP', serif;">
                        入室
                    </button>
                    <p id="authError" class="text-red-600 text-center mt-4 font-bold hidden bg-red-100 p-2 border-2 border-red-600">パスワードが正しくありません</p>
                </form>
            </div>
        </div>

        <!-- メインコンテンツ -->
        <div id="mainContent" class="hidden">
            <!-- レトロな装飾要素 -->
            <div class="fixed top-8 right-8 w-32 h-32 bg-red-600 rounded-full opacity-30 pointer-events-none z-0"></div>
            <div class="fixed bottom-8 left-8 w-40 h-40 bg-red-600 rounded-full opacity-20 pointer-events-none z-0"></div>
            <div class="fixed top-1/2 right-1/4 w-24 h-24 bg-amber-100 rounded-full opacity-10 pointer-events-none z-0"></div>
            
            <div class="container mx-auto px-4 py-6 sm:py-12 relative z-10">
            <!-- ヘッダー -->
            <header class="text-center mb-8 sm:mb-16">
                <div class="mb-6 sm:mb-8 bg-amber-50 p-4 sm:p-8 border-4 sm:border-8 shadow-2xl mx-auto max-w-4xl" style="border-color: #8B4513; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                    <div class="w-20 h-20 sm:w-32 sm:h-32 bg-red-600 rounded-full mx-auto mb-4 sm:mb-6 shadow-lg"></div>
                    <h1 class="text-3xl sm:text-5xl md:text-7xl font-bold mb-4 sm:mb-6" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.2em; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                        みなととあらがの<br>成長記録
                    </h1>
                    <div class="h-1 sm:h-2 mx-auto mb-4 sm:mb-6" style="background-color: #8B4513; width: 150px; max-width: 200px;"></div>
                    <p class="text-xl sm:text-2xl md:text-3xl font-bold mb-6 sm:mb-8" style="font-family: 'Noto Serif JP', serif; color: #B22222; letter-spacing: 0.3em;">
                        誇り高き日本を作ろう
                    </p>
                    <div class="bg-white px-4 sm:px-8 py-3 sm:py-4 inline-block border-2 sm:border-4 shadow-lg" style="border-color: #8B4513;">
                        <p class="text-sm sm:text-lg md:text-xl font-bold mb-2" style="color: #8B4513;">
                            みなと 誕生日: 2025年11月7日
                        </p>
                        <p class="text-sm sm:text-lg md:text-xl font-bold mb-3 sm:mb-4" style="color: #8B4513;">
                            あらが 誕生日: 1998年5月9日
                        </p>
                        <p id="minatoDayAgeDisplay" class="text-2xl sm:text-3xl md:text-4xl font-black mt-2" style="color: #B22222;">
                            みなと生後 ${currentDayAge} 日目
                        </p>
                        <p id="aragaDayAgeDisplay" class="text-2xl sm:text-3xl md:text-4xl font-black mt-2" style="color: #B22222;">
                            あらが生後 ${currentAragaDayAge} 日目
                        </p>
                    </div>
                </div>
            </header>

            <!-- 最新の記録 -->
            <section class="mb-8 sm:mb-12">
                <div class="bg-amber-50 p-4 sm:p-6 border-4 sm:border-8 mb-6 sm:mb-8 text-center shadow-xl" style="border-color: #8B4513;">
                    <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.2em;">
                        直近で更新された記録
                    </h2>
                </div>
                <div id="latest-entries" class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 max-w-5xl mx-auto">
                    <div class="text-center text-gray-500 col-span-2">
                        読み込み中...
                    </div>
                </div>
            </section>

            <!-- ナビゲーションボタン -->
            <div class="flex flex-col md:flex-row gap-4 sm:gap-6 justify-center mt-8 sm:mt-12">
                <a href="/view" class="text-white font-bold py-4 sm:py-6 px-8 sm:px-12 text-center transition duration-300 shadow-2xl text-lg sm:text-xl md:text-2xl border-4 sm:border-8" style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321; letter-spacing: 0.2em;">
                    日記を見る
                </a>
                <a href="/post" class="bg-amber-50 font-bold py-4 sm:py-6 px-8 sm:px-12 text-center transition duration-300 shadow-2xl text-lg sm:text-xl md:text-2xl border-4 sm:border-8" style="font-family: 'Noto Serif JP', serif; color: #8B4513; border-color: #8B4513; letter-spacing: 0.2em;">
                    今日の記録を投稿する
                </a>
            </div>
            
            <!-- ログアウトボタン -->
            <div class="flex justify-center mt-6 sm:mt-8">
                <button onclick="logout()" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 sm:py-3 px-6 sm:px-8 text-center transition duration-300 shadow-lg text-sm sm:text-base border-2 sm:border-4 border-gray-700" style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.1em;">
                    ログアウト
                </button>
            </div>
        </div>
        </div>

        <script>
            // パスワード認証
            const CORRECT_PASSWORD = 'minato1107';
            
            // ページ読み込み時に認証状態をチェック（localStorageを使用）
            document.addEventListener('DOMContentLoaded', () => {
                const isAuthenticated = localStorage.getItem('authenticated');
                if (isAuthenticated === 'true') {
                    showMainContent();
                }
            });
            
            function checkPassword(event) {
                event.preventDefault();
                const password = document.getElementById('passwordInput').value;
                const errorEl = document.getElementById('authError');
                
                if (password === CORRECT_PASSWORD) {
                    // localStorageに保存（ブラウザを閉じても保持）
                    localStorage.setItem('authenticated', 'true');
                    showMainContent();
                } else {
                    errorEl.classList.remove('hidden');
                    document.getElementById('passwordInput').value = '';
                    document.getElementById('passwordInput').focus();
                }
            }
            
            function showMainContent() {
                document.getElementById('authScreen').classList.add('hidden');
                document.getElementById('mainContent').classList.remove('hidden');
                
                // 素数判定
                checkPrimeDay();
            }
            
            // ログアウト関数
            function logout() {
                if (confirm('ログアウトしますか？')) {
                    localStorage.removeItem('authenticated');
                    location.reload();
                }
            }
            
            // 素数判定関数
            function isPrime(num) {
                if (num < 2) return false;
                if (num === 2) return true;
                if (num % 2 === 0) return false;
                
                for (let i = 3; i <= Math.sqrt(num); i += 2) {
                    if (num % i === 0) return false;
                }
                return true;
            }
            
            // 日齢計算関数
            function calculateDayAge(birthDate) {
                const today = new Date();
                const birth = new Date(birthDate);
                const diffTime = today.getTime() - birth.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                return diffDays + 1;
            }
            
            // 素数記念日チェック
            function checkPrimeDay() {
                const BIRTH_DATE_MINATO = '2025-11-07';
                const BIRTH_DATE_ARAGA = '1998-05-09';
                
                const minatoDayAgeEl = document.getElementById('minatoDayAgeDisplay');
                const aragaDayAgeEl = document.getElementById('aragaDayAgeDisplay');
                
                // リアルタイムで日齢を計算
                const minatoDayAge = calculateDayAge(BIRTH_DATE_MINATO);
                const aragaDayAge = calculateDayAge(BIRTH_DATE_ARAGA);
                
                // みなとの表示
                if (isPrime(minatoDayAge)) {
                    minatoDayAgeEl.innerHTML = 'みなと生後 ' + minatoDayAge + ' 日目<br><span style="color: #DC143C; font-size: 1.2rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎊 素数記念日 🎊</span>';
                } else {
                    minatoDayAgeEl.textContent = 'みなと生後 ' + minatoDayAge + ' 日目';
                }
                
                // あらがの表示
                if (isPrime(aragaDayAge)) {
                    aragaDayAgeEl.innerHTML = 'あらが生後 ' + aragaDayAge + ' 日目<br><span style="color: #DC143C; font-size: 1.2rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎊 素数記念日 🎊</span>';
                } else {
                    aragaDayAgeEl.textContent = 'あらが生後 ' + aragaDayAge + ' 日目';
                }
            }
        </script>
        <script>
            // 最新の記録を取得
            fetch('/api/entries/latest')
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.data.length > 0) {
                        const container = document.getElementById('latest-entries');
                        const personColors = {
                            'minato': 'blue',
                            'araga': 'blue'
                        };
                        const personNames = {
                            'minato': 'みなと',
                            'araga': 'あらが'
                        };
                        const personIcons = {
                            'minato': 'fa-baby',
                            'araga': 'fa-user'
                        };

                        const emojis = {
                            'minato': '👶',
                            'araga': '👴'
                        };
                        
                        // みなと→あらがの順番に並び替え
                        const personOrder = ['minato', 'araga'];
                        const sortedData = data.data.sort((a, b) => {
                            return personOrder.indexOf(a.person) - personOrder.indexOf(b.person);
                        });
                        
                        // 日齢計算関数
                        const BIRTH_DATE_MINATO = '2025-11-07';
                        const BIRTH_DATE_ARAGA = '1998-10-01';
                        
                        function calculateDayAge(dateString, birthDateString) {
                            const [birthYear, birthMonth, birthDay] = birthDateString.split('-').map(Number);
                            const [targetYear, targetMonth, targetDay] = dateString.split('-').map(Number);
                            
                            const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
                            const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
                            
                            const diffTime = targetDate.getTime() - birthDate.getTime();
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            return diffDays + 1;
                        }
                        
                        container.innerHTML = sortedData.map(entry => {
                            // 各人の日齢を計算
                            const minatoDayAge = calculateDayAge(entry.entry_date, BIRTH_DATE_MINATO);
                            const aragaDayAge = calculateDayAge(entry.entry_date, BIRTH_DATE_ARAGA);
                            
                            const minatoPrimeLabel = isPrime(minatoDayAge) ? ' <span style="color: #FFD700; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🎊素数記念日🎊</span>' : '';
                            const aragaPrimeLabel = isPrime(aragaDayAge) ? ' <span style="color: #FFD700; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🎊素数記念日🎊</span>' : '';
                            
                            // 各人に対応する日齢とラベルを選択
                            const dayAgeText = entry.person === 'minato' 
                                ? \`みなと生後\${minatoDayAge}日目\${minatoPrimeLabel}\`
                                : \`あらが生後\${aragaDayAge}日目\${aragaPrimeLabel}\`;
                            
                            return \`
                                <div class="bg-amber-50 shadow-2xl overflow-hidden hover:shadow-2xl transition duration-300 border-8 cursor-pointer" 
                                     style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"
                                     onclick="showFullEntry('\${entry.person}', '\${entry.entry_date}', '\${entry.image_url}', '\${entry.title}', \${entry.day_age}, \${minatoDayAge}, \${aragaDayAge})">
                                    <div class="p-6 border-b-4" style="background-color: #D2691E; border-color: #8B4513;">
                                        <h3 class="font-bold text-3xl text-center text-white mb-2" style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.2em; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                                            \${emojis[entry.person]} \${personNames[entry.person]}
                                        </h3>
                                        <p class="text-sm text-amber-100 text-center font-bold">\${entry.entry_date}（\${dayAgeText}）</p>
                                    </div>
                                    <img src="\${entry.image_url}" alt="\${entry.title}" class="w-full h-64 object-cover border-y-4" style="border-color: #8B4513;">
                                    <div class="p-6">
                                        <p class="text-center text-xl font-bold" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.1em;">\${entry.title}</p>
                                    </div>
                                </div>
                            \`;
                        }).join('');
                    }
                })
                .catch(err => console.error('Error loading entries:', err));
            
            // 日記を削除する関数
            function deleteEntry(date, person) {
                if (!confirm('本当にこの記録を削除しますか？\\n削除した記録は復元できません。')) {
                    return;
                }
                
                fetch(\`/api/entries/\${date}/\${person}\`, {
                    method: 'DELETE'
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert('記録を削除しました');
                        location.reload();
                    } else {
                        alert('削除に失敗しました: ' + data.error);
                    }
                })
                .catch(err => {
                    console.error('Error deleting entry:', err);
                    alert('削除に失敗しました');
                });
            }
            
            // 日記を全面表示する関数
            function showFullEntry(person, date, imageUrl, title, dayAge, minatoDayAge, aragaDayAge) {
                const personConfig = {
                    'minato': { name: 'みなと', emoji: '👶', color: 'blue' },
                    'araga': { name: 'あらが', emoji: '👴', color: 'blue' }
                };
                const config = personConfig[person];
                
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.remove();
                    }
                };
                
                // 各人の素数記念日ラベル
                const minatoPrimeLabel = isPrime(minatoDayAge) ? ' <span style="color: #FFD700; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🎊素数記念日🎊</span>' : '';
                const aragaPrimeLabel = isPrime(aragaDayAge) ? ' <span style="color: #FFD700; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🎊素数記念日🎊</span>' : '';
                
                // 日齢表示テキスト
                const dayAgeText = person === 'minato' 
                    ? \`みなと生後\${minatoDayAge}日目\${minatoPrimeLabel}\`
                    : \`あらが生後\${aragaDayAge}日目\${aragaPrimeLabel}\`;
                
                modal.innerHTML = \`
                    <div class="bg-amber-50 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border-8" style="border-color: #8B4513; box-shadow: 0 20px 60px rgba(0,0,0,0.7);">
                        <div class="p-8 border-b-8" style="background-color: #D2691E; border-color: #8B4513;">
                            <h2 class="font-bold text-5xl text-center mb-4 text-white" style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.2em; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                                \${config.emoji} \${config.name}
                            </h2>
                            <p class="text-center text-amber-100 text-xl font-bold">
                                \${date}（\${dayAgeText}）
                            </p>
                        </div>
                        <img src="\${imageUrl}" alt="\${title}" class="w-full max-h-[500px] object-contain bg-gray-100 border-y-8" style="border-color: #8B4513;">
                        <div class="p-8">
                            <p class="text-center text-3xl font-bold mb-8" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.1em;">
                                \${title}
                            </p>
                            <div class="flex flex-col sm:flex-row justify-center gap-4">
                                <button onclick="location.href='/post?date=\${date}&person=\${person}'" 
                                        class="text-white font-bold py-3 sm:py-4 px-6 sm:px-10 transition shadow-2xl text-lg sm:text-xl border-4 sm:border-8" 
                                        style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321; letter-spacing: 0.1em;">
                                    この日記を編集する
                                </button>
                                <button onclick="deleteEntry('\${date}', '\${person}')" 
                                        class="bg-red-600 hover:bg-red-700 text-white font-bold py-3 sm:py-4 px-6 sm:px-10 transition shadow-2xl text-lg sm:text-xl border-4 sm:border-8 border-red-800" 
                                        style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.1em;">
                                    この日記を削除する
                                </button>
                                <button onclick="this.closest('.fixed').remove()" 
                                        class="bg-amber-50 font-bold py-3 sm:py-4 px-6 sm:px-10 transition shadow-2xl text-lg sm:text-xl border-4 sm:border-8" 
                                        style="font-family: 'Noto Serif JP', serif; color: #8B4513; border-color: #8B4513; letter-spacing: 0.1em;">
                                    閉じる
                                </button>
                            </div>
                        </div>
                    </div>
                \`;
                
                document.body.appendChild(modal);
            }
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
        <title>日記を見る - みなととあらがの成長記録</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="min-h-screen" style="background: linear-gradient(135deg, #2c5a5a 0%, #1a3d3d 100%);">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- ヘッダー -->
            <header class="mb-8 bg-amber-50 p-8 border-8 shadow-2xl" style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div class="text-center mb-6">
                    <h1 class="text-5xl md:text-6xl font-bold mb-2" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.3em; text-shadow: 2px 2px 4px rgba(0,0,0,0.1);">
                        日記を見る
                    </h1>
                    <div class="h-2 w-32 mx-auto mt-4" style="background-color: #8B4513;"></div>
                </div>
                <div class="flex justify-center items-center">
                    <a href="/" class="w-full sm:w-auto text-white hover:opacity-90 font-bold py-4 px-10 text-center transition duration-300 shadow-lg text-xl border-8" style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321; letter-spacing: 0.1em;">
                        TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- 日齢検索 -->
            <div class="bg-amber-50 shadow-2xl p-6 mb-8 border-8" style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div class="flex flex-wrap items-center gap-4 justify-center">
                    <label class="font-bold text-xl" style="font-family: 'Noto Serif JP', serif; color: #8B4513;">みなと</label>
                    <input type="number" id="dayAgeInput" min="1" placeholder="1" 
                           class="border-4 px-4 py-2 w-24 text-center text-lg font-bold bg-white" style="border-color: #8B4513; color: #8B4513;">
                    <label class="font-bold text-xl" style="font-family: 'Noto Serif JP', serif; color: #8B4513;">日目へジャンプ</label>
                    <button onclick="jumpToDayAge()" 
                            class="text-white font-bold px-8 py-2 transition shadow-lg border-4 text-lg" style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321;">
                        移動
                    </button>
                </div>
            </div>

            <!-- カレンダー -->
            <div class="bg-amber-50 shadow-2xl p-6 mb-8 border-8" style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div class="flex justify-between items-center mb-4">
                    <button onclick="changeMonth(-1)" class="font-bold text-3xl px-4 py-2 border-4 shadow-lg hover:opacity-80 transition" style="color: #8B4513; border-color: #8B4513; background-color: white;">
                        ←
                    </button>
                    <h2 id="calendarTitle" class="text-3xl font-bold" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.2em;"></h2>
                    <button onclick="changeMonth(1)" class="font-bold text-3xl px-4 py-2 border-4 shadow-lg hover:opacity-80 transition" style="color: #8B4513; border-color: #8B4513; background-color: white;">
                        →
                    </button>
                </div>
                <div id="calendar" class="grid grid-cols-7 gap-2"></div>
            </div>

            <!-- 記録表示エリア -->
            <div id="entriesArea" class="hidden">
                <div class="bg-amber-50 shadow-2xl p-6 mb-6 sticky top-0 z-10 border-8" style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <h2 id="selectedDate" class="text-3xl font-bold text-center mb-2" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.1em;"></h2>
                    <p id="selectedDayAge" class="text-xl text-center font-bold" style="color: #B22222;"></p>
                </div>

                <div id="entriesCards" class="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8 max-w-5xl mx-auto">
                    <!-- 記録カードがここに表示される -->
                </div>

                <div class="flex justify-between max-w-5xl mx-auto">
                    <button onclick="navigateDay(-1)" class="text-white font-bold py-4 px-10 transition shadow-2xl text-xl border-8 hover:opacity-90" style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321; letter-spacing: 0.1em;">
                        ← 前の日
                    </button>
                    <button onclick="navigateDay(1)" class="text-white font-bold py-4 px-10 transition shadow-2xl text-xl border-8 hover:opacity-90" style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321; letter-spacing: 0.1em;">
                        次の日 →
                    </button>
                </div>
            </div>
        </div>

        <script src="/static/auth.js"></script>
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
        <title>記録を投稿 - みなととあらがの成長記録</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="min-h-screen" style="background: linear-gradient(135deg, #2c5a5a 0%, #1a3d3d 100%);">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <!-- ヘッダー -->
            <header class="mb-8 bg-amber-50 p-8 border-8 shadow-2xl" style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div class="text-center mb-6">
                    <h1 class="text-4xl md:text-5xl font-bold mb-2" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.3em; text-shadow: 2px 2px 4px rgba(0,0,0,0.1);">
                        今日の記録を投稿
                    </h1>
                    <div class="h-2 w-32 mx-auto mt-4" style="background-color: #8B4513;"></div>
                </div>
                <div class="flex justify-center">
                    <a href="/" class="text-white hover:opacity-90 font-bold py-4 px-10 text-center transition duration-300 shadow-lg text-xl border-8" style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321; letter-spacing: 0.1em;">
                        TOPへ戻る
                    </a>
                </div>
            </header>

            <!-- ユーザー選択フォーム -->
            <div id="selectForm" class="bg-amber-50 shadow-2xl p-8 border-8" style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <h2 class="text-4xl font-bold mb-8 text-center pb-4 border-b-4" style="font-family: 'Noto Serif JP', serif; color: #8B4513; border-color: #8B4513; letter-spacing: 0.2em;">誰の記録？</h2>
                <form onsubmit="handleUserSelect(event)">
                    <div class="mb-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button type="button" onclick="selectUser('araga')" class="user-select-btn bg-white hover:bg-amber-50 font-bold py-10 px-6 transition duration-300 shadow-2xl border-8 hover:opacity-90" style="border-color: #8B4513; color: #8B4513;">
                                <div class="text-7xl mb-3">🎸</div>
                                <div class="text-3xl" style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.2em;">あらが</div>
                            </button>
                            <button type="button" onclick="selectUser('minato')" class="user-select-btn bg-white hover:bg-amber-50 font-bold py-10 px-6 transition duration-300 shadow-2xl border-8 hover:opacity-90" style="border-color: #8B4513; color: #8B4513;">
                                <div class="text-7xl mb-3">👶</div>
                                <div class="text-3xl" style="font-family: 'Noto Serif JP', serif; letter-spacing: 0.2em;">みなと</div>
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <!-- 投稿フォーム -->
            <div id="postForm" class="hidden">
                <div class="bg-amber-50 shadow-2xl p-8 border-8" style="border-color: #8B4513; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <div class="mb-6 flex justify-between items-center border-b-4 pb-4" style="border-color: #8B4513;">
                        <h2 class="text-3xl font-bold" style="font-family: 'Noto Serif JP', serif; color: #8B4513; letter-spacing: 0.1em;">
                            <span id="displayEmoji"></span> <span id="displayName"></span>の記録
                        </h2>
                        <button onclick="logout()" class="text-lg font-bold hover:opacity-80 transition px-4 py-2 border-4" style="font-family: 'Noto Serif JP', serif; color: #8B4513; border-color: #8B4513;">
                            別の人に変更
                        </button>
                    </div>

                    <form onsubmit="handleSubmit(event)">
                        <div class="mb-6">
                            <label class="block font-bold mb-2 text-xl" style="font-family: 'Noto Serif JP', serif; color: #8B4513;">日付</label>
                            <input type="date" id="entryDate" class="w-full border-4 px-4 py-3 text-lg bg-white" style="border-color: #8B4513; color: #8B4513;" required>
                            <p id="dayAgeDisplay" class="text-xl mt-2 font-bold" style="color: #B22222;"></p>
                        </div>

                        <div class="mb-6">
                            <label class="block font-bold mb-2 text-xl" style="font-family: 'Noto Serif JP', serif; color: #8B4513;">見出し（最大50文字）</label>
                            <input type="text" id="title" maxlength="50" class="w-full border-4 px-4 py-3 text-lg bg-white" style="border-color: #8B4513; color: #8B4513;" required placeholder="今日の出来事を一言で">
                        </div>

                        <div class="mb-6">
                            <label class="block font-bold mb-2 text-xl" style="font-family: 'Noto Serif JP', serif; color: #8B4513;">画像（JPG/PNG、最大5MB）</label>
                            <input type="file" id="image" accept="image/jpeg,image/png" class="w-full border-4 px-4 py-3 bg-white" style="border-color: #8B4513;" required>
                            <div id="imagePreview" class="mt-4 hidden">
                                <img id="previewImage" class="max-w-full h-auto shadow-lg border-8" style="border-color: #8B4513;">
                            </div>
                        </div>

                        <div class="flex gap-4">
                            <button type="submit" id="submitBtn" class="flex-1 text-white font-bold py-4 px-8 transition duration-300 shadow-2xl text-2xl border-8 hover:opacity-90" style="font-family: 'Noto Serif JP', serif; background-color: #8B4513; border-color: #654321; letter-spacing: 0.2em;">
                                投稿する
                            </button>
                            <button type="button" id="editBtn" onclick="loadExistingEntry()" class="bg-amber-50 hover:bg-amber-100 font-bold py-4 px-8 transition duration-300 shadow-2xl text-xl border-8 hidden" style="font-family: 'Noto Serif JP', serif; color: #8B4513; border-color: #8B4513;">
                                既存の記録を編集
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- メッセージエリア -->
            <div id="message" class="mt-4 hidden"></div>
        </div>

        <script src="/static/auth.js"></script>
        <script src="/static/post.js"></script>
    </body>
    </html>
  `);
});

export default app
