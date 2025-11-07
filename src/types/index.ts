// Cloudflare Bindings型定義
export type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
};

// ユーザー型
export type User = {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  person_id: 'minato' | 'araga' | 'ryu';
  created_at: string;
};

// 記録エントリー型
export type Entry = {
  id: number;
  entry_date: string;
  day_age: number;
  person: 'minato' | 'araga' | 'ryu';
  title: string;
  image_url: string;
  created_at: string;
  updated_at: string;
};

// API レスポンス型
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

// 記録の投稿リクエスト
export type CreateEntryRequest = {
  entry_date: string;
  person: 'minato' | 'araga' | 'ryu';
  title: string;
  image: File | string;
};

// 日付から日齢を計算
export const BIRTH_DATE = new Date('2025-11-07T00:00:00+09:00');

export function calculateDayAge(date: Date | string): number {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = targetDate.getTime() - BIRTH_DATE.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export function calculateDateFromDayAge(dayAge: number): string {
  const targetDate = new Date(BIRTH_DATE);
  targetDate.setDate(targetDate.getDate() + (dayAge - 1));
  return targetDate.toISOString().split('T')[0];
}
