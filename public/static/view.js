// 定数
const BIRTH_DATE = new Date('2025-11-07T00:00:00+09:00');

// 状態管理
let currentMonth = new Date();
let selectedDate = null;
let availableDates = [];

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // URLパラメータをチェック
  const urlParams = new URLSearchParams(window.location.search);
  const dateParam = urlParams.get('date');
  const dayParam = urlParams.get('day');

  if (dayParam) {
    jumpToDayAge(parseInt(dayParam));
  } else if (dateParam) {
    loadEntriesForDate(dateParam);
  }

  // 今日の日付を設定
  const today = new Date().toISOString().split('T')[0];
  loadAvailableDates().then(() => {
    renderCalendar();
  });

  // キーボードショートカット
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('dayAgeInput').focus();
    }
  });
});

// 利用可能な日付を取得
async function loadAvailableDates() {
  try {
    const response = await fetch('/api/entries/dates');
    const data = await response.json();
    if (data.success) {
      availableDates = data.data.map(d => ({
        date: d.entry_date,
        dayAge: d.day_age,
        count: d.entry_count
      }));
    }
  } catch (error) {
    console.error('Error loading available dates:', error);
  }
}

// カレンダーをレンダリング
function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  // タイトル更新
  document.getElementById('calendarTitle').textContent = 
    `${year}年${month + 1}月`;

  // カレンダーのHTML生成
  const calendar = document.getElementById('calendar');
  calendar.innerHTML = '';

  // 曜日ヘッダー
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach(day => {
    const dayEl = document.createElement('div');
    dayEl.className = 'text-center font-bold text-gray-600 p-2';
    dayEl.textContent = day;
    calendar.appendChild(dayEl);
  });

  // 月の最初の日の曜日
  const firstDay = new Date(year, month, 1).getDay();
  
  // 空白セルを追加
  for (let i = 0; i < firstDay; i++) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'p-2';
    calendar.appendChild(emptyEl);
  }

  // 日付セルを追加
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    const dayEl = document.createElement('button');
    dayEl.className = 'p-2 rounded hover:bg-gray-100 transition relative';
    dayEl.textContent = day;

    // 誕生日以前は選択不可
    if (date < BIRTH_DATE) {
      dayEl.className += ' text-gray-300 cursor-not-allowed';
      dayEl.disabled = true;
    } else {
      // 記録がある日付をマーク
      const dateInfo = availableDates.find(d => d.date === dateStr);
      if (dateInfo) {
        if (dateInfo.count === 3) {
          dayEl.className += ' bg-blue-100 text-blue-800 font-bold';
          // 青マーク
          const mark = document.createElement('span');
          mark.className = 'absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full';
          dayEl.appendChild(mark);
        } else {
          dayEl.className += ' bg-yellow-100 text-yellow-800';
          // 黄マーク
          const mark = document.createElement('span');
          mark.className = 'absolute top-0 right-0 w-2 h-2 bg-yellow-500 rounded-full';
          dayEl.appendChild(mark);
        }
      }

      dayEl.onclick = () => loadEntriesForDate(dateStr);
    }

    calendar.appendChild(dayEl);
  }
}

// 月を変更
function changeMonth(delta) {
  currentMonth.setMonth(currentMonth.getMonth() + delta);
  renderCalendar();
}

// 特定の日付の記録を読み込む
async function loadEntriesForDate(dateStr) {
  try {
    selectedDate = dateStr;
    const response = await fetch(`/api/entries/${dateStr}`);
    const data = await response.json();

    if (data.success) {
      displayEntries(dateStr, data.data);
      // URLを更新
      window.history.pushState({}, '', `?date=${dateStr}`);
    }
  } catch (error) {
    console.error('Error loading entries:', error);
  }
}

// 記録を表示
function displayEntries(dateStr, entries) {
  const entriesArea = document.getElementById('entriesArea');
  const selectedDateEl = document.getElementById('selectedDate');
  const selectedDayAgeEl = document.getElementById('selectedDayAge');
  const entriesCards = document.getElementById('entriesCards');

  // 日付と日齢を計算
  const date = new Date(dateStr + 'T00:00:00');
  const dayAge = calculateDayAge(date);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[date.getDay()];

  selectedDateEl.textContent = `${dateStr}（${weekday}）`;
  selectedDayAgeEl.textContent = `みなと ${dayAge}日目`;

  // 記録カードを生成
  const personData = {
    'minato': { name: 'みなと', icon: 'fa-baby', color: 'pink' },
    'araga': { name: 'あらが', icon: 'fa-user', color: 'blue' },
    'ryu': { name: 'りゅう', icon: 'fa-user', color: 'green' }
  };

  const persons = ['minato', 'araga', 'ryu'];
  entriesCards.innerHTML = persons.map(person => {
    const entry = entries.find(e => e.person === person);
    const info = personData[person];

    if (entry) {
      return `
        <div class="bg-white rounded-lg shadow-lg overflow-hidden">
          <div class="bg-${info.color}-100 p-4 border-b-4 border-${info.color}-400">
            <h3 class="font-bold text-xl text-${info.color}-800">
              <i class="fas ${info.icon} mr-2"></i>
              ${info.name}
            </h3>
          </div>
          <img src="${entry.image_url}" alt="${entry.title}" class="w-full h-64 object-cover">
          <div class="p-6">
            <p class="text-center text-lg text-gray-800">${entry.title}</p>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="bg-white rounded-lg shadow-lg overflow-hidden">
          <div class="bg-gray-100 p-4 border-b-4 border-gray-300">
            <h3 class="font-bold text-xl text-gray-600">
              <i class="fas ${info.icon} mr-2"></i>
              ${info.name}
            </h3>
          </div>
          <div class="p-12 text-center text-gray-400">
            <i class="fas fa-image text-6xl mb-4"></i>
            <p>まだ記録がありません</p>
          </div>
        </div>
      `;
    }
  }).join('');

  entriesArea.classList.remove('hidden');
  entriesArea.scrollIntoView({ behavior: 'smooth' });
}

// 日齢ワープ
function jumpToDayAge(dayAge = null) {
  if (dayAge === null) {
    dayAge = parseInt(document.getElementById('dayAgeInput').value);
  }

  if (!dayAge || dayAge < 1) {
    alert('日齢は1以上の数値を入力してください');
    return;
  }

  const currentDayAge = calculateDayAge(new Date());
  if (dayAge > currentDayAge) {
    alert(`日齢は1〜${currentDayAge}日目の範囲で入力してください`);
    return;
  }

  const dateStr = calculateDateFromDayAge(dayAge);
  loadEntriesForDate(dateStr);

  // カレンダーも該当月に移動
  const targetDate = new Date(dateStr);
  currentMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  renderCalendar();
}

// 日付ナビゲーション
function navigateDay(delta) {
  if (!selectedDate) return;

  const currentIndex = availableDates.findIndex(d => d.date === selectedDate);
  let nextIndex = currentIndex - delta; // 降順なので逆

  if (nextIndex >= 0 && nextIndex < availableDates.length) {
    loadEntriesForDate(availableDates[nextIndex].date);
  } else {
    alert(delta > 0 ? '次の記録はありません' : '前の記録はありません');
  }
}

// 日齢を計算
function calculateDayAge(date) {
  const diffMs = date.getTime() - BIRTH_DATE.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

// 日齢から日付を計算
function calculateDateFromDayAge(dayAge) {
  const targetDate = new Date(BIRTH_DATE);
  targetDate.setDate(targetDate.getDate() + (dayAge - 1));
  return targetDate.toISOString().split('T')[0];
}
