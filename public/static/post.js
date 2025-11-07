// みなととあらがの成長記録 - 投稿ページ用JavaScript

const BIRTH_DATE_MINATO = '2025-11-07';
const BIRTH_DATE_ARAGA = '1998-05-09';
const BIRTH_DATE = BIRTH_DATE_MINATO; // 後方互換性のため
let currentUser = null;
let isEditMode = false;

const userEmojis = {
    'minato': '👶',
    'araga': '👴'
};

const userNames = {
    'minato': 'みなと',
    'araga': 'あらが'
};

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
    // URLパラメータを確認
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const personParam = params.get('person');
    
    // 編集モードの場合（URLパラメータがある場合）
    if (dateParam && personParam) {
        selectUser(personParam).then(() => {
            document.getElementById('entryDate').value = dateParam;
            updateDayAgeDisplay();
            loadExistingEntry();
        });
    }
    // それ以外の場合は常にユーザー選択画面を表示（localStorageを使わない）
});

// ユーザー選択処理
async function selectUser(person_id) {
    try {
        const res = await fetch('/api/auth/select', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ person_id })
        });
        
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.data.user;
            // localStorageに保存しない（毎回選択させる）
            showPostForm();
        } else {
            showMessage(data.error || 'ユーザー選択に失敗しました', 'error');
        }
    } catch (error) {
        console.error('User select error:', error);
        showMessage('ユーザー選択でエラーが発生しました', 'error');
    }
}

// ログアウト（ユーザー変更）
function logout() {
    currentUser = null;
    isEditMode = false;
    // localStorageを削除
    localStorage.removeItem('currentUser');
    
    // フォームをリセット
    document.getElementById('title').value = '';
    document.getElementById('image').value = '';
    document.getElementById('image').setAttribute('required', 'required');
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('submitBtn').innerHTML = '投稿する';
    
    document.getElementById('selectForm').classList.remove('hidden');
    document.getElementById('postForm').classList.add('hidden');
}

// 投稿フォームを表示
function showPostForm() {
    document.getElementById('selectForm').classList.add('hidden');
    document.getElementById('postForm').classList.remove('hidden');
    document.getElementById('displayName').textContent = currentUser.display_name;
    document.getElementById('displayEmoji').textContent = userEmojis[currentUser.person_id];
    document.getElementById('displayEmoji2').textContent = userEmojis[currentUser.person_id];
    
    // 今日の日付を設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entryDate').value = today;
    document.getElementById('entryDate').min = BIRTH_DATE;
    
    updateDayAgeDisplay();
    
    // 日付変更時にも日齢を更新
    document.getElementById('entryDate').addEventListener('change', () => {
        updateDayAgeDisplay();
        checkExistingEntry();
    });
    
    // 画像プレビュー
    document.getElementById('image').addEventListener('change', handleImagePreview);
    
    // 編集ボタンを確認
    checkExistingEntry();
}

// 日齢表示を更新
function updateDayAgeDisplay() {
    const dateInput = document.getElementById('entryDate');
    const dayAgeDisplay = document.getElementById('dayAgeDisplay');
    
    if (dateInput.value && currentUser) {
        // 各人の日齢を計算
        const minatoDayAge = calculateDayAgeFromBirth(dateInput.value, BIRTH_DATE_MINATO);
        const aragaDayAge = calculateDayAgeFromBirth(dateInput.value, BIRTH_DATE_ARAGA);
        
        // みなとの日齢表示
        const minatoPrimeLabel = isPrime(minatoDayAge) ? ' <span style="color: #DC143C; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎊 素数記念日 🎊</span>' : '';
        const minatoText = `みなと生後 ${minatoDayAge} 日目${minatoPrimeLabel}`;
        
        // あらがの日齢表示
        const aragaPrimeLabel = isPrime(aragaDayAge) ? ' <span style="color: #DC143C; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎊 素数記念日 🎊</span>' : '';
        const aragaText = `あらが生後 ${aragaDayAge} 日目${aragaPrimeLabel}`;
        
        // 両方の日齢を表示
        dayAgeDisplay.innerHTML = `${minatoText}<br>${aragaText}`;
    }
}

// 日齢を計算（汎用関数）
function calculateDayAgeFromBirth(dateString, birthDateString) {
    const [birthYear, birthMonth, birthDay] = birthDateString.split('-').map(Number);
    const [targetYear, targetMonth, targetDay] = dateString.split('-').map(Number);
    
    const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
    const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
    
    const diffTime = targetDate.getTime() - birthDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
}

// 日齢を計算（後方互換性のため）
function calculateDayAge(dateString) {
    return calculateDayAgeFromBirth(dateString, BIRTH_DATE_MINATO);
}

// 既存の記録をチェック
async function checkExistingEntry() {
    const dateInput = document.getElementById('entryDate');
    const editBtn = document.getElementById('editBtn');
    
    if (!dateInput.value || !currentUser) {
        editBtn.classList.add('hidden');
        return;
    }
    
    try {
        const res = await fetch(`/api/entries/${dateInput.value}`);
        const data = await res.json();
        
        if (data.success) {
            const existingEntry = data.data.find(e => e.person === currentUser.person_id);
            if (existingEntry) {
                editBtn.classList.remove('hidden');
            } else {
                editBtn.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Error checking existing entry:', error);
    }
}

// 既存の記録を読み込んで編集
async function loadExistingEntry() {
    const dateInput = document.getElementById('entryDate');
    
    try {
        const res = await fetch(`/api/entries/${dateInput.value}`);
        const data = await res.json();
        
        if (data.success) {
            const existingEntry = data.data.find(e => e.person === currentUser.person_id);
            if (existingEntry) {
                // フォームに既存データを設定
                document.getElementById('title').value = existingEntry.title;
                
                // 画像プレビュー表示
                document.getElementById('previewImage').src = existingEntry.image_url;
                document.getElementById('imagePreview').classList.remove('hidden');
                
                // 画像は必須ではなくする
                document.getElementById('image').removeAttribute('required');
                
                isEditMode = true;
                document.getElementById('submitBtn').innerHTML = '✏️ 更新する ✏️';
                
                showMessage('既存の記録を編集モードで読み込みました', 'info');
            }
        }
    } catch (error) {
        console.error('Error loading entry:', error);
        showMessage('記録の読み込みに失敗しました', 'error');
    }
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
    submitBtn.textContent = isEditMode ? '更新中...' : '投稿中...';
    
    try {
        const entryDate = document.getElementById('entryDate').value;
        const title = document.getElementById('title').value;
        const imageFile = document.getElementById('image').files[0];
        
        // 新規投稿の場合は画像必須
        if (!isEditMode && !imageFile) {
            showMessage('画像を選択してください', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🎉 投稿する 🎉';
            return;
        }
        
        // FormDataを作成
        const formData = new FormData();
        formData.append('entry_date', entryDate);
        formData.append('person', currentUser.person_id);
        formData.append('title', title);
        if (imageFile) {
            formData.append('image', imageFile);
        }
        
        const res = await fetch('/api/entries', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
        if (data.success) {
            showMessage(isEditMode ? '記録を更新しました！🎉' : '投稿が完了しました！🎉', 'success');
            
            // フォームをリセット
            document.getElementById('title').value = '';
            document.getElementById('image').value = '';
            document.getElementById('image').setAttribute('required', 'required');
            document.getElementById('imagePreview').classList.add('hidden');
            isEditMode = false;
            document.getElementById('submitBtn').innerHTML = '🎉 投稿する 🎉';
            
            // 編集ボタンを表示
            checkExistingEntry();
            
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
        submitBtn.innerHTML = isEditMode ? '✏️ 更新する ✏️' : '🎉 投稿する 🎉';
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
    
    messageEl.className = `mt-4 p-4 rounded-lg border-2 ${bgColor} ${textColor} ${borderColor} font-bold text-lg`;
    messageEl.textContent = text;
    messageEl.classList.remove('hidden');
    
    // 5秒後に非表示
    setTimeout(() => {
        messageEl.classList.add('hidden');
    }, 5000);
}
