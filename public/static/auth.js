// 認証チェック用JavaScript

// ページ読み込み時に認証チェック
document.addEventListener('DOMContentLoaded', () => {
    const isAuthenticated = sessionStorage.getItem('authenticated');
    if (isAuthenticated !== 'true') {
        // 認証されていない場合はTOPページにリダイレクト
        window.location.href = '/';
    }
});
