// みなとの時間、ふたりの時間 - 閲覧ページ用JavaScript

const BIRTH_DATE = '2025-11-07';
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let datesWithEntries = [];

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
    loadDatesWithEntries();
    renderCalendar();
});

// 記録がある日付の一覧を取得
async function loadDatesWithEntries() {
    try {
        const res = await fetch('/api/entries/dates');
        const data = await res.json();
        if (data.success) {
            datesWithEntries = data.data.map(d => ({
                date: d.entry_date,
                dayAge: d.day_age,
                entryCount: d.entry_count
            }));
        }
    } catch (error) {
        console.error('Error loading dates:', error);
    }
}

// カレンダーを描画
function renderCalendar() {
    const title = document.getElementById('calendarTitle');
    const calendar = document.getElementById('calendar');
    
    title.textContent = `${currentYear}年${currentMonth + 1}月`;
    
    // 月の初日と最終日を取得
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    
    // カレンダーをクリア
    calendar.innerHTML = '';
    
    // 曜日ヘッダー
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    weekdays.forEach(day => {
        const cell = document.createElement('div');
        cell.className = 'text-center font-bold text-gray-600 py-2';
        cell.textContent = day;
        calendar.appendChild(cell);
    });
    
    // 空白セル（月の初日まで）
    for (let i = 0; i < startWeekday; i++) {
        const cell = document.createElement('div');
        calendar.appendChild(cell);
    }
    
    // 日付セル
    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = document.createElement('div');
        
        // 記録の有無をチェック
        const hasEntry = datesWithEntries.find(d => d.date === date);
        const isBirthDate = date >= BIRTH_DATE;
        
        let cellClass = 'text-center py-3 rounded cursor-pointer transition ';
        
        if (!isBirthDate) {
            cellClass += 'text-gray-300 cursor-not-allowed';
        } else if (hasEntry) {
            if (hasEntry.entryCount === 3) {
                cellClass += 'bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold';
            } else {
                cellClass += 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-bold';
            }
        } else {
            cellClass += 'hover:bg-gray-100 text-gray-700';
        }
        
        cell.className = cellClass;
        cell.textContent = day;
        
        if (isBirthDate) {
            cell.onclick = () => loadEntries(date);
        }
        
        calendar.appendChild(cell);
    }
}

// 月を変更
function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar();
}

// 日齢からジャンプ
async function jumpToDayAge() {
    const input = document.getElementById('dayAgeInput');
    const dayAge = parseInt(input.value);
    
    if (isNaN(dayAge) || dayAge < 1) {
        alert('1以上の数値を入力してください');
        return;
    }
    
    try {
        const res = await fetch(`/api/entries/day/${dayAge}`);
        const data = await res.json();
        
        if (data.success && data.data.length > 0) {
            const date = data.data[0].entry_date;
            loadEntries(date);
            
            // カレンダーも該当月に移動
            const [year, month] = date.split('-').map(Number);
            currentYear = year;
            currentMonth = month - 1;
            renderCalendar();
        } else {
            alert(`みなと${dayAge}日目の記録はまだありません`);
        }
    } catch (error) {
        console.error('Error jumping to day age:', error);
        alert('エラーが発生しました');
    }
}

// 特定日の記録を読み込み
async function loadEntries(date) {
    selectedDate = date;
    
    try {
        const res = await fetch(`/api/entries/${date}`);
        const data = await res.json();
        
        if (data.success) {
            displayEntries(date, data.data);
        }
    } catch (error) {
        console.error('Error loading entries:', error);
    }
}

// 記録を表示
function displayEntries(date, entries) {
    const entriesArea = document.getElementById('entriesArea');
    const selectedDateEl = document.getElementById('selectedDate');
    const selectedDayAgeEl = document.getElementById('selectedDayAge');
    const entriesCards = document.getElementById('entriesCards');
    
    // 日付を日本語形式でフォーマット
    const dateObj = new Date(date + 'T00:00:00+09:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${weekdays[dateObj.getDay()]})`;
    
    // 日齢を計算
    const birthDate = new Date(BIRTH_DATE + 'T00:00:00+09:00');
    const targetDate = new Date(date + 'T00:00:00+09:00');
    const diffTime = targetDate.getTime() - birthDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dayAge = diffDays + 1;
    
    selectedDateEl.textContent = '🎉 ' + formattedDate + ' 🎉';
    selectedDayAgeEl.textContent = `👶 みなと ${dayAge} 日目 👶`;
    
    // カードを生成
    const personConfig = {
        minato: { name: 'みなと', emoji: '👶', color: 'pink' },
        araga: { name: 'あらが', emoji: '🎸', color: 'blue' },
        ryu: { name: 'りゅう', emoji: '🎯', color: 'green' }
    };
    
    entriesCards.innerHTML = ['minato', 'araga', 'ryu'].map(person => {
        const entry = entries.find(e => e.person === person);
        const config = personConfig[person];
        
        if (entry) {
            return `
                <div class="bg-gradient-to-br from-${config.color}-100 to-${config.color}-200 rounded-3xl shadow-2xl overflow-hidden border-4 border-${config.color}-400 transform hover:scale-105 transition">
                    <div class="bg-gradient-to-r from-${config.color}-400 to-${config.color}-500 p-6 border-b-4 border-${config.color}-600">
                        <h3 class="font-black text-3xl text-white drop-shadow-lg text-center">
                            ${config.emoji} ${config.name} ${config.emoji}
                        </h3>
                    </div>
                    <img src="${entry.image_url}" alt="${entry.title}" class="w-full h-auto object-cover border-4 border-${config.color}-300">
                    <div class="p-8 bg-white">
                        <p class="text-center text-2xl font-bold text-gray-800">✨ ${entry.title} ✨</p>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="bg-gradient-to-br from-gray-200 to-gray-300 rounded-3xl shadow-xl p-8 text-center border-4 border-gray-400">
                    <h3 class="font-bold text-2xl text-gray-600 mb-4">
                        ${config.emoji} ${config.name}
                    </h3>
                    <p class="text-gray-500 text-xl">📝 まだ記録がありません</p>
                </div>
            `;
        }
    }).join('');
    
    entriesArea.classList.remove('hidden');
    
    // スクロール
    entriesArea.scrollIntoView({ behavior: 'smooth' });
}

// 日を移動
async function navigateDay(delta) {
    if (!selectedDate) return;
    
    const currentIndex = datesWithEntries.findIndex(d => d.date === selectedDate);
    const nextIndex = currentIndex + delta;
    
    if (nextIndex >= 0 && nextIndex < datesWithEntries.length) {
        const nextDate = datesWithEntries[nextIndex].date;
        loadEntries(nextDate);
    } else {
        alert(delta > 0 ? 'これより新しい記録はありません' : 'これより古い記録はありません');
    }
}
