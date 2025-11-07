// みなととあらがの成長記録 - 閲覧ページ用JavaScript

const BIRTH_DATE_MINATO = '2025-11-07';
const BIRTH_DATE_ARAGA = '1998-05-09';
const BIRTH_DATE = BIRTH_DATE_MINATO; // 後方互換性のため
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let datesWithEntries = [];

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

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
    loadDatesWithEntries().then(() => {
        // デフォルトで当日の記録を表示（ローカル時間で取得）
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        loadEntries(todayStr);
    });
});

// 記録がある日付の一覧を取得
async function loadDatesWithEntries() {
    try {
        // 誕生日から今日までの範囲で記録を取得
        const [birthYear, birthMonth, birthDay] = BIRTH_DATE.split('-').map(Number);
        const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
        const today = new Date();
        const daysDiff = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24)) + 1;
        
        console.log('Checking dates from', BIRTH_DATE, 'to today');
        console.log('Days to check:', daysDiff);
        
        // 過去の日付を確認（ローカル時間で計算）
        for (let i = 0; i < Math.min(daysDiff, 60); i++) {
            const checkDate = new Date(birthDate);
            checkDate.setDate(checkDate.getDate() + i);
            
            const year = checkDate.getFullYear();
            const month = String(checkDate.getMonth() + 1).padStart(2, '0');
            const day = String(checkDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            // 該当日の記録を確認
            const entriesRes = await fetch(`/api/entries/${dateStr}`);
            const entriesData = await entriesRes.json();
            
            if (entriesData.success && entriesData.data.length > 0) {
                const dayAge = calculateDayAgeFromDate(dateStr);
                datesWithEntries.push({
                    date: dateStr,
                    dayAge: dayAge,
                    entryCount: entriesData.data.length
                });
                console.log('Found entries for', dateStr, '(Day', dayAge, ')');
            }
        }
        
        console.log('datesWithEntries:', datesWithEntries);
        renderCalendar();
    } catch (error) {
        console.error('Error loading dates:', error);
        renderCalendar();
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
    weekdays.forEach((day, index) => {
        const cell = document.createElement('div');
        cell.className = 'text-center font-bold text-gray-600 py-2';
        if (index === 0) cell.classList.add('text-red-600'); // 日曜日
        if (index === 6) cell.classList.add('text-blue-600'); // 土曜日
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
        
        // 現在表示中の日付かどうかをチェック
        const isSelectedDate = date === selectedDate;
        const isBirthDate = date >= BIRTH_DATE;
        
        let cellClass = 'text-center py-3 rounded cursor-pointer transition ';
        
        if (!isBirthDate) {
            cellClass += 'text-gray-300 cursor-not-allowed';
        } else if (isSelectedDate) {
            // 現在表示中の日付のみハイライト
            cellClass += 'bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold border-2 border-amber-500';
        } else {
            cellClass += 'hover:bg-gray-100 text-gray-700 border border-gray-200';
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
    
    const date = calculateDateFromDayAge(dayAge);
    
    // 記録を確認
    const res = await fetch(`/api/entries/${date}`);
    const data = await res.json();
    
    if (data.success && data.data.length > 0) {
        loadEntries(date);
        
        // カレンダーも該当月に移動
        const [year, month] = date.split('-').map(Number);
        currentYear = year;
        currentMonth = month - 1;
        renderCalendar();
    } else {
        alert(`みなと生後${dayAge}日目の記録はまだありません`);
    }
}

// 日齢から日付を計算（ローカル時間で計算してズレを防ぐ）
function calculateDateFromDayAge(dayAge) {
    const [year, month, day] = BIRTH_DATE.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    const targetDate = new Date(birthDate);
    targetDate.setDate(targetDate.getDate() + (dayAge - 1));
    
    const targetYear = targetDate.getFullYear();
    const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
    const targetDay = String(targetDate.getDate()).padStart(2, '0');
    return `${targetYear}-${targetMonth}-${targetDay}`;
}

// 日付から日齢を計算（汎用関数）
function calculateDayAgeFromBirth(dateString, birthDateString) {
    const [birthYear, birthMonth, birthDay] = birthDateString.split('-').map(Number);
    const [targetYear, targetMonth, targetDay] = dateString.split('-').map(Number);
    
    const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
    const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
    
    const diffTime = targetDate.getTime() - birthDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
}

// 日付から日齢を計算（後方互換性のため）
function calculateDayAgeFromDate(dateString) {
    return calculateDayAgeFromBirth(dateString, BIRTH_DATE_MINATO);
}

// 特定日の記録を読み込み
async function loadEntries(date) {
    selectedDate = date;
    
    try {
        const res = await fetch(`/api/entries/${date}`);
        const data = await res.json();
        
        if (data.success) {
            displayEntries(date, data.data);
            // カレンダーを再レンダリングして選択日をハイライト
            renderCalendar();
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
    
    // 日付を日本語形式でフォーマット（ローカル時間で作成）
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const formattedDate = `${year}年${month}月${day}日(${weekdays[dateObj.getDay()]})`;
    
    // 各人の日齢を計算
    const minatoDayAge = calculateDayAgeFromBirth(date, BIRTH_DATE_MINATO);
    const aragaDayAge = calculateDayAgeFromBirth(date, BIRTH_DATE_ARAGA);
    
    selectedDateEl.textContent = formattedDate;
    
    // みなとの素数判定
    const minatoPrimeLabel = isPrime(minatoDayAge) ? ' <span style="color: #DC143C; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎊 素数記念日 🎊</span>' : '';
    const minatoText = `みなと生後 ${minatoDayAge} 日目${minatoPrimeLabel}`;
    
    // あらがの素数判定
    const aragaPrimeLabel = isPrime(aragaDayAge) ? ' <span style="color: #DC143C; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎊 素数記念日 🎊</span>' : '';
    const aragaText = `あらが生後 ${aragaDayAge} 日目${aragaPrimeLabel}`;
    
    // 両方の日齢を表示
    selectedDayAgeEl.innerHTML = `${minatoText}<br>${aragaText}`;
    
    // カードを生成
    const personConfig = {
        minato: { name: 'みなと', emoji: '👶', color: 'blue' },
        araga: { name: 'あらが', emoji: '👴', color: 'blue' }
    };
    
    // みなと→あらがの順番に並び替え
    const personOrder = ['minato', 'araga'];
    
    entriesCards.innerHTML = personOrder.map(person => {
        const entry = entries.find(e => e.person === person);
        const config = personConfig[person];
        
        if (entry) {
            return `
                <div class="bg-white rounded-lg shadow-lg overflow-hidden border-2 border-${config.color}-400 cursor-pointer hover:shadow-2xl transition" 
                     onclick="showFullEntry('${entry.person}', '${date}')">
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
    
    entriesArea.classList.remove('hidden');
    
    // スクロール
    entriesArea.scrollIntoView({ behavior: 'smooth' });
}

// 日を移動（記録の有無に関わらず前後の日に移動）
async function navigateDay(delta) {
    if (!selectedDate) {
        console.log('navigateDay: selectedDate is null');
        return;
    }
    
    console.log('===== navigateDay START =====');
    console.log('delta:', delta, '(delta < 0 = 前の日, delta > 0 = 次の日)');
    console.log('selectedDate:', selectedDate);
    
    // 現在の日付から前後の日を計算
    const [year, month, day] = selectedDate.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);
    
    // 1日前または1日後に移動
    currentDate.setDate(currentDate.getDate() + delta);
    
    const nextYear = currentDate.getFullYear();
    const nextMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
    const nextDay = String(currentDate.getDate()).padStart(2, '0');
    const nextDate = `${nextYear}-${nextMonth}-${nextDay}`;
    
    console.log('Moving to date:', nextDate);
    
    // 誕生日より前には移動できない
    if (nextDate < BIRTH_DATE) {
        console.log('ERROR: Cannot go before birth date');
        alert('誕生日より前の日付には移動できません');
        return;
    }
    
    // 今日より先の日付にも移動可能（制限なし）
    console.log('Date validation passed');
    
    // 記録の有無に関わらず移動
    await loadEntries(nextDate);
    
    // カレンダーも該当月に移動
    currentYear = nextYear;
    currentMonth = currentDate.getMonth();
    renderCalendar();
    
    console.log('===== navigateDay END (SUCCESS) =====');
}

// 日記を全面表示
function showFullEntry(person, date) {
    const personConfig = {
        minato: { name: 'みなと', emoji: '👶', color: 'blue' },
        araga: { name: 'あらが', emoji: '👴', color: 'blue' }
    };
    const config = personConfig[person];
    
    fetch(`/api/entries/${date}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const entry = data.data.find(e => e.person === person);
                if (!entry) return;
                
                // 各人の日齢を計算
                const minatoDayAge = calculateDayAgeFromBirth(date, BIRTH_DATE_MINATO);
                const aragaDayAge = calculateDayAgeFromBirth(date, BIRTH_DATE_ARAGA);
                
                // 素数記念日ラベル
                const minatoPrimeLabel = isPrime(minatoDayAge) ? ' 🎊素数記念日🎊' : '';
                const aragaPrimeLabel = isPrime(aragaDayAge) ? ' 🎊素数記念日🎊' : '';
                
                // 日齢表示テキスト
                const dayAgeText = person === 'minato' 
                    ? `みなと生後${minatoDayAge}日目${minatoPrimeLabel}`
                    : `あらが生後${aragaDayAge}日目${aragaPrimeLabel}`;
                
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.remove();
                    }
                };
                
                modal.innerHTML = `
                    <div class="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border-4 border-${config.color}-400">
                        <div class="bg-${config.color}-100 p-8 border-b-4 border-${config.color}-400">
                            <h2 class="font-bold text-4xl text-${config.color}-800 text-center mb-2" style="font-family: 'Noto Serif JP', serif;">
                                ${config.emoji} ${config.name}
                            </h2>
                            <p class="text-center text-gray-600 text-lg">
                                ${entry.entry_date}（${dayAgeText}）
                            </p>
                        </div>
                        <img src="${entry.image_url}" alt="${entry.title}" class="w-full max-h-[500px] object-contain bg-gray-100">
                        <div class="p-8 bg-gray-50">
                            <p class="text-center text-2xl font-bold text-gray-800 mb-6" style="font-family: 'Noto Serif JP', serif;">
                                ${entry.title}
                            </p>
                            <div class="flex justify-center gap-4">
                                <button onclick="location.href='/post?date=${date}&person=${person}'" 
                                        class="bg-${config.color}-600 hover:bg-${config.color}-700 text-white font-bold py-3 px-8 transition shadow-lg text-lg border-2 border-${config.color}-800" 
                                        style="font-family: 'Noto Serif JP', serif;">
                                    この日記を編集する
                                </button>
                                <button onclick="this.closest('.fixed').remove()" 
                                        class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 transition shadow-lg text-lg" 
                                        style="font-family: 'Noto Serif JP', serif;">
                                    閉じる
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
            }
        })
        .catch(err => console.error('Error loading entry:', err));
}
