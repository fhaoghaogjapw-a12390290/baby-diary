// みなとの時間、ふたりの時間 - 閲覧ページ用JavaScript（1画面表示版）

const BIRTH_DATE = '2025-11-07';

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
    loadAllEntries();
});

// すべての記録を日付ごとに取得して表示
async function loadAllEntries() {
    try {
        // すべての記録を取得して日付ごとにグループ化
        const allEntriesRes = await fetch('/api/entries/latest?limit=1000'); // 仮のエンドポイントを使用
        
        // 代わりに、既知の日付範囲で記録を取得
        const dates = [];
        const birthDate = new Date('2025-11-07');
        const today = new Date();
        const daysDiff = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24)) + 1;
        
        // 過去の日付を生成
        for (let i = 0; i < Math.min(daysDiff, 30); i++) {
            const checkDate = new Date(birthDate);
            checkDate.setDate(checkDate.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];
            dates.push(dateStr);
        }
        
        const container = document.getElementById('allEntriesArea');
        container.innerHTML = '';
        let hasAnyEntries = false;
        
        // 新しい順（降順）でループ
        for (const date of dates.reverse()) {
            // 該当日の記録を取得
            const entriesRes = await fetch(`/api/entries/${date}`);
            const entriesData = await entriesRes.json();
            
            if (entriesData.success && entriesData.data.length > 0) {
                hasAnyEntries = true;
                const dayAge = calculateDayAge(date);
                const section = createDateSection(date, dayAge, entriesData.data);
                container.innerHTML += section;
            }
        }
        
        if (!hasAnyEntries) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-12">
                    <p class="text-2xl font-bold mb-4">まだ記録がありません</p>
                    <a href="/post" class="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 transition shadow-lg border-2 border-red-800" style="font-family: 'Noto Serif JP', serif;">
                        最初の記録を投稿する
                    </a>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading entries:', error);
        document.getElementById('allEntriesArea').innerHTML = `
            <div class="text-center text-red-600 py-12">
                <p class="text-xl font-bold">エラーが発生しました</p>
            </div>
        `;
    }
}

// 日齢を計算
function calculateDayAge(dateString) {
    const birthDate = new Date(BIRTH_DATE + 'T00:00:00+09:00');
    const targetDate = new Date(dateString + 'T00:00:00+09:00');
    const diffTime = targetDate.getTime() - birthDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
}

// 日付ごとのセクションを生成
function createDateSection(date, dayAge, entries) {
    // 日付を日本語形式でフォーマット
    const dateObj = new Date(date + 'T00:00:00+09:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekdays[dateObj.getDay()]})`;
    
    // 人物設定
    const personConfig = {
        minato: { name: 'みなと', emoji: '👶', color: 'pink' },
        araga: { name: 'あらが', emoji: '🎸', color: 'blue' },
        ryu: { name: 'りゅう', emoji: '🎯', color: 'green' }
    };
    
    // あらが→みなと→りゅうの順番に並び替え
    const personOrder = ['araga', 'minato', 'ryu'];
    const sortedEntries = [...entries].sort((a, b) => {
        return personOrder.indexOf(a.person) - personOrder.indexOf(b.person);
    });
    
    // カードを生成
    const cardsHTML = personOrder.map(person => {
        const entry = sortedEntries.find(e => e.person === person);
        const config = personConfig[person];
        
        if (entry) {
            return `
                <div class="bg-white rounded-lg shadow-lg overflow-hidden border-2 border-${config.color}-400">
                    <div class="bg-${config.color}-100 p-6 border-b-2 border-${config.color}-400">
                        <h3 class="font-bold text-2xl text-${config.color}-800 text-center" style="font-family: 'Noto Serif JP', serif;">
                            ${config.emoji} ${config.name}
                        </h3>
                    </div>
                    <img src="${entry.image_url}" alt="${entry.title}" class="w-full h-64 object-cover">
                    <div class="p-6 bg-gray-50">
                        <p class="text-center text-xl font-bold text-gray-800" style="font-family: 'Noto Serif JP', serif;">${entry.title}</p>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="bg-gray-100 rounded-lg shadow p-8 text-center border-2 border-gray-300">
                    <h3 class="font-bold text-xl text-gray-600 mb-2" style="font-family: 'Noto Serif JP', serif;">
                        ${config.emoji} ${config.name}
                    </h3>
                    <p class="text-gray-500">記録なし</p>
                </div>
            `;
        }
    }).join('');
    
    return `
        <div class="mb-16">
            <!-- 日付ヘッダー -->
            <div class="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-red-600">
                <h2 class="text-3xl font-bold text-red-700 text-center mb-2" style="font-family: 'Noto Serif JP', serif;">
                    ${formattedDate}
                </h2>
                <p class="text-xl text-gray-600 text-center font-bold">
                    みなと ${dayAge} 日目
                </p>
            </div>
            
            <!-- 3人の記録カード -->
            <div class="grid md:grid-cols-3 gap-6">
                ${cardsHTML}
            </div>
        </div>
    `;
}
