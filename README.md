# みなとの時間、ふたりの時間

## プロジェクト概要

**サイト名**: みなとの時間、ふたりの時間  
**コンセプト**: 同じ空の下、違う時間の流れ。赤ちゃん「みなと」の成長記録と、それを見守る友人「あらが」「りゅう」の日常を対比させた視覚日記

---

## 🎯 プロジェクトの目的

2025年11月7日に誕生した「みなと」の成長記録を軸に、友人2人の日常を並べて記録することで、異なる時間の流れを可視化する。
3人の記録が1つのタイムラインに並ぶことで、「人生の時間の違い」と「共有された空間」を感じられるユニークな日記サイト。

---

## 🌐 公開URL

- **開発環境**: https://3000-iuq35kyw5chw16de122am-b9b802c4.sandbox.novita.ai
- **本番環境**: 未デプロイ（Cloudflare Pagesへのデプロイが必要）

---

## ✨ 主な機能

### 実装済み機能 ✅

1. **TOPページ（物語の始まり）**
   - みなとの誕生日と現在の日齢をリアルタイム表示
   - 最新の3人の記録を表示（カード形式）
   - 閲覧ページ・投稿ページへのナビゲーション

2. **閲覧ページ（タイムライン・ビューワー）**
   - カレンダーインターフェース（記録がある日にマーク）
   - 日付選択で3人の記録を縦並びで表示
   - **日齢ワープ機能**: 「みなとX日目」で直接ジャンプ
   - 前の日/次の日ナビゲーション

3. **投稿ページ（トリプルダイアリー投稿フォーム）**
   - ユーザー認証（3アカウント: minato_admin, araga_user, ryu_user）
   - 日付選択と日齢の自動表示
   - 画像アップロード（5MB制限、プレビュー機能付き）
   - 見出し入力（最大50文字）

4. **API機能**
   - 最新の記録取得 (`GET /api/entries/latest`)
   - 特定日付の記録取得 (`GET /api/entries/:date`)
   - 日齢から記録取得 (`GET /api/entries/day/:dayAge`)
   - 記録が存在する日付一覧取得 (`GET /api/entries/dates`)
   - 記録投稿 (`POST /api/entries`)
   - ユーザー認証 (`POST /api/auth/login`)

### 未実装機能 ⚠️

- **R2画像ストレージ**: 現在はプレースホルダー画像を使用
- **本番環境へのデプロイ**: Cloudflare Pagesへの正式デプロイ
- **統計ダッシュボード**: 投稿数推移、頻度比較
- **コメント機能**: 記録へのコメント機能
- **エクスポート機能**: PDF出力、年間アルバム生成

---

## 📊 データアーキテクチャ

### データモデル

#### `users` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER | 主キー |
| username | TEXT | ユーザー名（ユニーク） |
| password_hash | TEXT | パスワードハッシュ |
| display_name | TEXT | 表示名 |
| person_id | TEXT | 人物ID（minato, araga, ryu） |
| created_at | DATETIME | 作成日時 |

#### `entries` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER | 主キー |
| entry_date | TEXT | 記録日（YYYY-MM-DD） |
| day_age | INTEGER | みなとの日齢 |
| person | TEXT | 記録者（minato, araga, ryu） |
| title | TEXT | 見出し |
| image_url | TEXT | 画像URL |
| created_at | DATETIME | 作成日時 |
| updated_at | DATETIME | 更新日時 |

### ストレージサービス

- **Cloudflare D1 (SQLite)**: ユーザー情報、記録データ
- **Cloudflare R2**: 画像ファイル（未実装、現在はプレースホルダー）

---

## 🎨 使い方

### 一般ユーザー（閲覧）

1. **TOPページにアクセス**
   - 現在のみなとの日齢を確認
   - 最新の記録を閲覧

2. **「日記を見る」をクリック**
   - カレンダーで日付を選択
   - または「日齢ワープ」で直接ジャンプ（例: 「10」日目へ）
   - 3人の記録が縦に並んで表示される

### 投稿者（みなと・あらが・りゅう）

1. **「今日の記録を投稿する」をクリック**

2. **ログイン**
   - ユーザー名を選択（みなと/あらが/りゅう）
   - パスワードを入力
     - `minato_admin`: `minato123`
     - `araga_user`: `araga123`
     - `ryu_user`: `ryu123`

3. **記録を投稿**
   - 日付を選択（デフォルトは今日）
   - 見出しを入力（最大50文字）
   - 画像をアップロード（JPG/PNG、最大5MB）
   - 「投稿する」ボタンをクリック

4. **投稿完了後、自動的に閲覧ページへ遷移**

---

## 🛠️ 技術スタック

### フロントエンド
- **Tailwind CSS**: スタイリング（CDN）
- **Font Awesome**: アイコン（CDN）
- **Vanilla JavaScript**: インタラクティブ機能

### バックエンド
- **Hono**: 軽量Webフレームワーク（TypeScript）
- **Cloudflare Workers**: エッジランタイム
- **Cloudflare Pages**: ホスティング

### データベース
- **Cloudflare D1**: SQLiteベースのグローバル分散データベース

### ストレージ
- **Cloudflare R2**: S3互換オブジェクトストレージ（未実装）

---

## 🚀 デプロイ状況

### 現在の状態

- **ローカル開発環境**: ✅ 動作中
- **Cloudflare Pages本番環境**: ❌ 未デプロイ

### デプロイ手順（本番環境）

1. **Cloudflare D1データベースの作成**
   ```bash
   npx wrangler d1 create webapp-production
   # database_idをwrangler.jsoncに設定
   ```

2. **Cloudflare R2バケットの作成**
   ```bash
   npx wrangler r2 bucket create webapp-images
   ```

3. **マイグレーションの適用**
   ```bash
   npm run db:migrate:prod
   ```

4. **Cloudflare Pagesプロジェクトの作成**
   ```bash
   npx wrangler pages project create webapp --production-branch main
   ```

5. **デプロイ**
   ```bash
   npm run deploy:prod
   ```

---

## 📅 推奨される次のステップ

1. **R2画像ストレージの実装**
   - 現在プレースホルダー画像を使用
   - R2バケットへの画像アップロード機能を追加

2. **本番環境へのデプロイ**
   - Cloudflare Pagesへの正式デプロイ
   - 本番データベースのセットアップ

3. **UI/UXの改善**
   - モバイル表示の最適化
   - 画像の遅延読み込み（Intersection Observer）
   - アニメーション追加

4. **機能拡張**
   - 統計ダッシュボード（投稿数グラフ）
   - 記念日の自動ハイライト（10日目、30日目、100日目など）
   - コメント機能

---

## 🔐 セキュリティ

### 認証情報

**デモ用アカウント（開発環境のみ）:**
- `minato_admin` / `minato123`
- `araga_user` / `araga123`
- `ryu_user` / `ryu123`

**⚠️ 本番環境では必ずパスワードを変更してください**

### セキュリティ対策

- パスワードはbcryptハッシュで保存
- セッションはlocalStorageに保存（簡易実装）
- 本番環境ではJWTトークンを推奨

---

## 📝 開発者向け情報

### ローカル開発

```bash
# 依存関係のインストール
npm install

# データベースのセットアップ
npm run db:migrate:local
npm run db:seed

# ビルド
npm run build

# PM2でサービス起動
pm2 start ecosystem.config.cjs

# テスト
curl http://localhost:3000
```

### データベース操作

```bash
# ローカルDBのリセット
npm run db:reset

# マイグレーション適用
npm run db:migrate:local

# シードデータ投入
npm run db:seed

# SQLコンソール
npm run db:console:local
```

### 便利なスクリプト

```bash
# ポート3000のクリーンアップ
npm run clean-port

# サービステスト
npm run test

# Cloudflare型定義生成
npm run cf-typegen
```

---

## 📦 プロジェクト構造

```
webapp/
├── src/
│   ├── index.tsx          # メインアプリケーション（Hono）
│   └── types/
│       └── index.ts       # TypeScript型定義
├── public/
│   └── static/
│       ├── view.js        # 閲覧ページのJS
│       ├── post.js        # 投稿ページのJS
│       └── style.css      # カスタムCSS
├── migrations/
│   └── 0001_initial_schema.sql  # データベーススキーマ
├── dist/                  # ビルド出力（自動生成）
├── .wrangler/             # Wrangler作業ディレクトリ
├── ecosystem.config.cjs   # PM2設定
├── wrangler.jsonc         # Cloudflare設定
├── package.json           # 依存関係とスクリプト
├── tsconfig.json          # TypeScript設定
├── vite.config.ts         # Viteビルド設定
└── README.md              # このファイル
```

---

## 📄 ライセンス

このプロジェクトは個人使用のみを目的としています。

---

## 🙏 謝辞

- **Hono**: 軽量で高速なWebフレームワーク
- **Cloudflare**: エッジコンピューティングプラットフォーム
- **Tailwind CSS**: ユーティリティファーストCSSフレームワーク

---

**最終更新日**: 2025年11月7日  
**バージョン**: 1.0.0 (MVP)  
**開発状況**: ✅ ローカル開発環境完成 / ❌ 本番環境未デプロイ
