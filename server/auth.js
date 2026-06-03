// مصادقة بسيطة وآمنة: تشفير كلمة المرور بـ scrypt + رموز جلسة عشوائية
import crypto from 'node:crypto';
import db from './db.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  // مقارنة بزمن ثابت لتفادي هجمات التوقيت
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now()
  );
  return token;
}

// يعيد بيانات المستخدم من الرمز، أو null إن كان غير صالح
export function userFromToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name AS displayName
       FROM tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token = ?`
    )
    .get(token);
  return row || null;
}
