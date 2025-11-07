# みなとの時間、ふたりの時間

**同じ空の下、違う時間の流れ。みなとの成長記録と、それを見守る友人の視覚日記**

## 📖 プロジェクト概要

- **プロジェクト名**: みなとの時間、ふたりの時間
- **誕生日**: 2025年11月7日
- **コンセプト**: 赤ちゃん「みなと」の成長記録と、友人「あらが」「りゅう」の日常を同じタイムラインで記録・対比する視覚日記アプリ

## 🌐 アクセスURL

- **開発環境**: https://3000-iuq35kyw5chw16de122am-b9b802c4.sandbox.novita.ai
- **TOPページ**: `/`
- **日記閲覧ページ**: `/view`
- **投稿ページ**: `/post`

## ✨ 主な機能

### 1. TOPページ（物語の始まり）
- みなとの誕生日と現在の日齢をリアルタイム表示
- 最新3件の記録をカード形式で表示
- 日記閲覧・投稿への誘導ボタン

### 2. 投稿インターフェース（今日の報告）
- 3つのアカウント（みなと、あらが、りゅう）で個別ログイン
- 日付選択（過去の日付にも遡及投稿可能）
- 自動日齢計算と表示
- 画像アップロード（最大5MB）とプレビュー機能
- 見出しテキスト入力（最大50文字）

**テストアカウント**:
- ユーザー名: `minato_admin` / パスワード: `minato123`
- ユーザー名: `araga_user` / パスワード: `araga123`
- ユーザー名: `ryu_user` / パスワード: `ryu123`

### 3. 閲覧ページ（タイムライン・ビューワー）
- カレンダーインターフェース
  - 記録がある日付をマーク表示（青=3人分完全、黄=不完全）
  - 月次ナビゲーション
- 日齢ワープ検索機能
  - 「みなとX日目」で直接ジャンプ
- 記録表示
  - 選択日の日付と日齢を大きく表示
  - 3人（みなと、あらが、りゅう）の記録を縦スクロール
  - 前の日/次の日ナビゲーション

### 4. 日齢計算システム
- みなとの誕生日（2025年11月7日）を基準とした日齢自動計算
- 日齢1 = 2025年11月7日（誕生日）
- 日齢N = 誕生日 + (N-1)日

## 🗄️ データアーキテクチャ

### データベース: Cloudflare D1（SQLite）

#### テーブル構成

**users テーブル**
```sql
- id: INTEGER PRIMARY KEY
- username: TEXT UNIQUE (minato_admin, araga_user, ryu_user)
- password_hash: TEXT
- display_name: TEXT (みなと, あらが, りゅう)
- person_id: TEXT (minato, araga, ryu)
- created_at: DATETIME
```

**entries テーブル**
```sql
- id: INTEGER PRIMARY KEY
- entry_date: TEXT (YYYY-MM-DD形式)
- day_age: INTEGER (みなとの日齢)
- person: TEXT (minato, araga, ryu)
- title: TEXT (見出し、最大50文字)
- image_url: TEXT (R2へのパス)
- created_at: DATETIME
- updated_at: DATETIME
```

### ストレージ: Cloudflare R2
- 画像ファイルの保存
- パス形式: `{entry_date}/{person}/{timestamp}-{filename}`

### データフロー
1. ユーザーが投稿フォームから画像+テキストを送信
2. 画像をR2にアップロード
3. 日齢を自動計算
4. D1データベースにメタデータを保存
5. 閲覧時はD1から記録を取得、R2から画像を配信

## 🎯 完了した機能

✅ プロジェクトセットアップ（Hono + Cloudflare Pages）  
✅ D1データベース設計とマイグレーション  
✅ TypeScript型定義とユーティリティ関数  
✅ バックエンドAPI実装（認証、CRUD操作）  
✅ TOPページ（最新記録表示、日齢カウント）  
✅ 投稿インターフェース（認証、画像アップロード、プレビュー）  
✅ 閲覧ページ（カレンダー、記録表示、ナビゲーション）  
✅ 日齢ワープ検索機能  
✅ 簡易認証システム（JWT + localStorage）  
✅ テストデータ投入（3日分のサンプル記録）  

## 🚧 未実装の機能

- 本番環境への画像アップロード機能（現在はプレースホルダー画像）
- パスワードハッシュ化（bcrypt）
- コメント機能
- 統計ダッシュボード
- エクスポート機能（PDF出力）
- 記念日ハイライト機能

## 🔧 開発環境

### 技術スタック
- **バックエンド**: Hono v4.10.4 + TypeScript
- **フロントエンド**: Vanilla JavaScript + TailwindCSS
- **データベース**: Cloudflare D1 (SQLite)
- **ストレージ**: Cloudflare R2
- **ホスティング**: Cloudflare Pages
- **ビルドツール**: Vite v6.3.5
- **デプロイツール**: Wrangler v4.4.0

### ローカル開発

```bash
# 依存関係のインストール
npm install --ignore-scripts

# データベースマイグレーション（ローカル）
npm run db:migrate:local

# テストデータ投入
npm run db:seed

# ビルド
npm run build

# 開発サーバー起動（PM2）
fuser -k 3000/tcp 2>/dev/null || true
pm2 start ecosystem.config.cjs

# ログ確認
pm2 logs --nostream

# サーバー停止
pm2 delete webapp
```

### データベース管理

```bash
# ローカルDBリセット
npm run db:reset

# ローカルDBコンソール
npm run db:console:local -- --command="SELECT * FROM entries"

# 本番DBマイグレーション
npm run db:migrate:prod
```

## 📁 プロジェクト構成

```
webapp/
├── src/
│   ├── index.tsx          # メインアプリケーション（Hono routes）
│   ├── types/
│   │   └── index.ts       # TypeScript型定義
│   └── utils/
│       ├── date.ts        # 日付・日齢計算関数
│       └── auth.ts        # 認証ユーティリティ
├── public/
│   └── static/
│       ├── view.js        # 閲覧ページJS
│       └── post.js        # 投稿ページJS
├── migrations/
│   └── 0001_initial_schema.sql  # DBスキーマ
├── seed.sql               # テストデータ
├── wrangler.jsonc         # Cloudflare設定
├── ecosystem.config.cjs   # PM2設定
├── package.json           # 依存関係とスクリプト
└── README.md              # このファイル
```

## 📝 使い方

### 新規ユーザーの場合

1. **TOPページにアクセス**
   - 現在のみなとの日齢を確認
   - 最新の記録をプレビュー

2. **投稿ページで記録を追加**
   - `/post` にアクセス
   - アカウントを選択してログイン
   - 日付、見出し、画像を入力して投稿

3. **閲覧ページで過去を振り返る**
   - `/view` にアクセス
   - カレンダーから日付を選択
   - または「日齢ワープ」で特定の日齢へジャンプ

### 記録のコンセプト

- **みなと（👶）**: 赤ちゃんの成長記録（授乳、お風呂、初めての○○など）
- **あらが（🧑）**: 友人の日常記録（仕事、趣味、日常の出来事）
- **りゅう（🧑）**: もう一人の友人の日常記録

→ 同じ日に3人の全く異なる時間の流れを対比させることで、人生の多様性と面白さを記録

## 🚀 推奨される次のステップ

1. **本番環境へのデプロイ準備**
   - Cloudflare D1データベースの本番作成
   - R2バケットの作成
   - 環境変数の設定

2. **セキュリティ強化**
   - bcryptによるパスワードハッシュ化
   - CSRF対策
   - 画像アップロードのバリデーション強化

3. **UI/UX改善**
   - モバイル最適化
   - 画像の遅延読み込み
   - ローディング状態の改善

4. **機能追加**
   - コメント機能（相互交流）
   - 月次/年次統計ダッシュボード
   - PDF/画像エクスポート機能

## 📄 ライセンス

このプロジェクトは個人利用を目的としています。

## 👥 作成者

- **開発**: Claude (AI Assistant)
- **企画**: プロジェクトオーナー

---

**最終更新日**: 2025年11月7日  
**デプロイ状態**: ✅ ローカル開発環境で動作確認済み  
**バージョン**: 1.0.0 (MVP)
