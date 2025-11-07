// 定数
const BIRTH_DATE = new Date('2025-11-07T00:00:00+09:00');

// セッション状態
let currentUser = null;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // セッションをチェック
  const savedSession = localStorage.getItem('session');
  if (savedSession) {
    currentUser = JSON.parse(savedSession);
    showPostForm();
  }

  // 日付入力の設定
  const dateInput = document.getElementById('entryDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.max = today;
    dateInput.min = '2025-11-07';
    updateDayAgeDisplay();

    dateInput.addEventListener('change', updateDayAgeDisplay);
  }

  // 画像プレビュー
  const imageInput = document.getElementById('image');
  if (imageInput) {
    imageInput.addEventListener('change', handleImagePreview);
  }
});

// ログイン処理
async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.data.user;
      localStorage.setItem('session', JSON.stringify({
        token: data.data.token,
        ...currentUser
      }));
      showPostForm();
    } else {
      showMessage(data.error || 'ログインに失敗しました', 'error');
    }
  } catch (error) {
    showMessage('ネットワークエラーが発生しました', 'error');
    console.error('Login error:', error);
  }
}

// ログアウト
function logout() {
  localStorage.removeItem('session');
  currentUser = null;
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('postForm').classList.add('hidden');
}

// 投稿フォームを表示
function showPostForm() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('postForm').classList.remove('hidden');
  document.getElementById('displayName').textContent = currentUser.display_name;
}

// 日齢表示を更新
function updateDayAgeDisplay() {
  const dateInput = document.getElementById('entryDate');
  const display = document.getElementById('dayAgeDisplay');

  if (dateInput && display) {
    const date = new Date(dateInput.value + 'T00:00:00');
    const dayAge = calculateDayAge(date);
    display.textContent = `みなと ${dayAge}日目`;
  }
}

// 画像プレビュー
function handleImagePreview(event) {
  const file = event.target.files[0];
  if (file) {
    // ファイルサイズチェック（5MB）
    if (file.size > 5 * 1024 * 1024) {
      showMessage('画像ファイルは5MB以下にしてください', 'error');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('previewImage').src = e.target.result;
      document.getElementById('imagePreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
}

// 投稿処理
async function handleSubmit(event) {
  event.preventDefault();

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '投稿中...';

  const entryDate = document.getElementById('entryDate').value;
  const title = document.getElementById('title').value;
  const imageFile = document.getElementById('image').files[0];

  if (!imageFile) {
    showMessage('画像を選択してください', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = '投稿する';
    return;
  }

  try {
    const formData = new FormData();
    formData.append('entry_date', entryDate);
    formData.append('person', currentUser.person_id);
    formData.append('title', title);
    formData.append('image', imageFile);

    const response = await fetch('/api/entries', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      showMessage('投稿が完了しました！', 'success');
      
      // フォームをリセット
      document.getElementById('title').value = '';
      document.getElementById('image').value = '';
      document.getElementById('imagePreview').classList.add('hidden');

      // 3秒後に閲覧ページへ遷移
      setTimeout(() => {
        window.location.href = `/view?date=${entryDate}`;
      }, 2000);
    } else {
      showMessage(data.error || '投稿に失敗しました', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '投稿する';
    }
  } catch (error) {
    showMessage('ネットワークエラーが発生しました', 'error');
    console.error('Submit error:', error);
    submitBtn.disabled = false;
    submitBtn.textContent = '投稿する';
  }
}

// メッセージ表示
function showMessage(text, type) {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `mt-4 p-4 rounded-lg ${
    type === 'success' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800'
  }`;
  messageEl.classList.remove('hidden');

  // 5秒後に非表示
  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 5000);
}

// 日齢を計算
function calculateDayAge(date) {
  const diffMs = date.getTime() - BIRTH_DATE.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}
