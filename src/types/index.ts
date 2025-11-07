// Cloudflare Bindings
export type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
};

// User types
export type User = {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  person_id: 'minato' | 'araga';
  created_at: string;
};

// Entry types
export type Entry = {
  id: number;
  entry_date: string;
  day_age: number;
  person: 'minato' | 'araga';
  title: string;
  image_url: string;
  created_at: string;
  updated_at: string;
};

export type EntryInput = {
  entry_date: string;
  day_age: number;
  person: 'minato' | 'araga';
  title: string;
  image_url: string;
};

// API Response types
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

// Calendar types
export type CalendarDay = {
  date: string;
  day_age: number;
  has_entries: boolean;
  entry_count: number;
};

// Auth types
export type LoginRequest = {
  username: string;
  password: string;
};

export type AuthPayload = {
  userId: number;
  username: string;
  person_id: 'minato' | 'araga';
  display_name: string;
};

// Constants
export const BIRTH_DATE_MINATO = '2025-11-07';
export const BIRTH_DATE_ARAGA = '1998-10-01';
// Backward compatibility
export const BIRTH_DATE = BIRTH_DATE_MINATO;

export const PERSON_DISPLAY_NAMES = {
  minato: 'みなと',
  araga: 'あらが',
} as const;

export const PERSON_EMOJIS = {
  minato: '👶',
  araga: '🎸',
} as const;
