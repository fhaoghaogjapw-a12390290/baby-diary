import { BIRTH_DATE } from '../types';

/**
 * 日齢から日付を計算
 * @param dayAge 日齢（1から始まる）
 * @returns 日付文字列 (YYYY-MM-DD)
 */
export function calculateDateFromDayAge(dayAge: number): string {
  const birthDate = new Date(BIRTH_DATE + 'T00:00:00+09:00');
  const targetDate = new Date(birthDate);
  targetDate.setDate(targetDate.getDate() + (dayAge - 1));
  return targetDate.toISOString().split('T')[0];
}

/**
 * 日付から日齢を計算
 * @param dateString 日付文字列 (YYYY-MM-DD)
 * @returns 日齢（1から始まる）
 */
export function calculateDayAgeFromDate(dateString: string): number {
  const birthDate = new Date(BIRTH_DATE + 'T00:00:00+09:00');
  const targetDate = new Date(dateString + 'T00:00:00+09:00');
  const diffTime = targetDate.getTime() - birthDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}

/**
 * 現在の日齢を取得
 * @returns 現在の日齢
 */
export function getCurrentDayAge(): number {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  return calculateDayAgeFromDate(today);
}

/**
 * 日付を日本語形式でフォーマット
 * @param dateString 日付文字列 (YYYY-MM-DD)
 * @returns フォーマットされた日付 (例: 2025年11月7日(木))
 */
export function formatDateJapanese(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00+09:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];
  return `${year}年${month}月${day}日(${weekday})`;
}

/**
 * 日付の妥当性チェック
 * @param dateString 日付文字列 (YYYY-MM-DD)
 * @returns 有効かどうか
 */
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString >= BIRTH_DATE;
}
