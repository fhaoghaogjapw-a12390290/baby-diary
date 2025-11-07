import { AuthPayload } from '../types';

// 簡易的なJWT実装（本番環境では適切なライブラリを使用してください）
const SECRET_KEY = 'minato-diary-secret-key-change-in-production';

/**
 * 簡易パスワードハッシュ検証
 * 本番環境ではbcryptなどを使用してください
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // 開発環境では簡易的な比較
  // 実際のbcryptハッシュとの比較は省略
  const testPasswords: { [key: string]: boolean } = {
    'minato123': true,
    'araga123': true,
    'ryu123': true,
  };
  return testPasswords[password] === true;
}

/**
 * 簡易JWT生成
 */
export async function generateToken(payload: AuthPayload): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = btoa(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
  const signature = btoa(SECRET_KEY + header + data);
  return `${header}.${data}.${signature}`;
}

/**
 * 簡易JWT検証
 */
export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    
    // 有効期限チェック
    if (payload.exp < Date.now()) {
      return null;
    }
    
    return {
      userId: payload.userId,
      username: payload.username,
      person_id: payload.person_id,
      display_name: payload.display_name,
    };
  } catch {
    return null;
  }
}

/**
 * Cookieからトークンを取得
 */
export function getTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const authCookie = cookies.find(c => c.startsWith('auth_token='));
  
  if (!authCookie) return null;
  
  return authCookie.split('=')[1];
}
