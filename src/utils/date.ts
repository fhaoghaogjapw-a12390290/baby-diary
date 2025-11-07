import { BIRTH_DATE, BIRTH_DATE_MINATO, BIRTH_DATE_ARAGA } from '../types';

/**
 * 日齢から日付を計算
 * @param dayAge 日齢（1から始まる）
 * @returns 日付文字列 (YYYY-MM-DD)
 */
export function calculateDateFromDayAge(dayAge: number): string {
  // 日付文字列から直接計算
  const [year, month, day] = BIRTH_DATE.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day); // ローカル時間で作成
  const targetDate = new Date(birthDate);
  targetDate.setDate(targetDate.getDate() + (dayAge - 1));
  
  // ローカル時間でフォーマット
  const targetYear = targetDate.getFullYear();
  const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
  const targetDay = String(targetDate.getDate()).padStart(2, '0');
  return `${targetYear}-${targetMonth}-${targetDay}`;
}

/**
 * 日付から日齢を計算
 * @param dateString 日付文字列 (YYYY-MM-DD)
 * @returns 日齢（1から始まる）
 */
export function calculateDayAgeFromDate(dateString: string): number {
  // 日付文字列から直接計算（ローカル時間）
  const [birthYear, birthMonth, birthDay] = BIRTH_DATE.split('-').map(Number);
  const [targetYear, targetMonth, targetDay] = dateString.split('-').map(Number);
  
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
  
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
  // ローカル時間で日付を作成
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
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

/**
 * あらがの日齢を計算
 * @param dateString 日付文字列 (YYYY-MM-DD)
 * @returns あらがの日齢（1から始まる）
 */
export function calculateAragaDayAge(dateString: string): number {
  const [birthYear, birthMonth, birthDay] = BIRTH_DATE_ARAGA.split('-').map(Number);
  const [targetYear, targetMonth, targetDay] = dateString.split('-').map(Number);
  
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
  
  const diffTime = targetDate.getTime() - birthDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}
