// みなとの時間、ふたりの時間 - 投稿ページ用JavaScript

const BIRTH_DATE = '2025-11-07';
let currentUser = null;

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
    // 今日の日付を設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entryDate').value = today;
    document.getElementById('entryDate').min = BIRTH_DATE;
    
    updateDayAgeDisplay();
    
    // 日付変更時にも日齢を更新
    document.getElementById('entryDate').addEventListener('change', updateDayAgeDisplay);
    
    // 画像プレビュー
    document.getElementById('image').addEventListener('change', handleImagePreview);
    
    // ローカルストレージから認証情報を確認
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showPostForm();
    }
});

// 日齢表示を更新
function updateDayAgeDisplay() {
    const dateInput = document.getElementById('entryDate');
    const dayAgeDisplay = document.getElementById('dayAgeDisplay');
    
    if (dateInput.value) {
        const dayAge = calculateDayAge(dateInput.value);
        dayAgeDisplay.textContent = `みなと ${dayAge} 日目`;
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

// ログイン処理
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            localStorage.setItem('auth_token', data.data.token);
            showPostForm();
        } else {
            showMessage(data.error || 'ログインに失敗しました', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('ログイン処理でエラーが発生しました', 'error');
    }
}

// ログアウト
function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth_token');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('postForm').classList.add('hidden');
}

// 投稿フォームを表示
function showPostForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('postForm').classList.remove('hidden');
    document.getElementById('displayName').textContent = currentUser.display_name;
}

// 画像プレビュー
function handleImagePreview(event) {
    const file = event.target.files[0];
    if (file) {
        // ファイルサイズチェック（5MB）
        if (file.size > 5 * 1024 * 1024) {
            showMessage('画像サイズは5MB以下にしてください', 'error');
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
    
    try {
        const entryDate = document.getElementById('entryDate').value;
        const title = document.getElementById('title').value;
        const imageFile = document.getElementById('image').files[0];
        
        if (!imageFile) {
            showMessage('画像を選択してください', 'error');
            return;
        }
        
        // FormDataを作成
        const formData = new FormData();
        formData.append('entry_date', entryDate);
        formData.append('person', currentUser.person_id);
        formData.append('title', title);
        formData.append('image', imageFile);
        
        const res = await fetch('/api/entries', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
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
        }
    } catch (error) {
        console.error('Submit error:', error);
        showMessage('投稿処理でエラーが発生しました', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '投稿する';
    }
}

// メッセージ表示
function showMessage(text, type = 'info') {
    const messageEl = document.getElementById('message');
    
    let bgColor = 'bg-blue-100';
    let textColor = 'text-blue-800';
    let borderColor = 'border-blue-400';
    
    if (type === 'error') {
        bgColor = 'bg-red-100';
        textColor = 'text-red-800';
        borderColor = 'border-red-400';
    } else if (type === 'success') {
        bgColor = 'bg-green-100';
        textColor = 'text-green-800';
        borderColor = 'border-green-400';
    }
    
    messageEl.className = `mt-4 p-4 rounded-lg border-2 ${bgColor} ${textColor} ${borderColor}`;
    messageEl.textContent = text;
    messageEl.classList.remove('hidden');
    
    // 5秒後に非表示
    setTimeout(() => {
        messageEl.classList.add('hidden');
    }, 5000);
}
