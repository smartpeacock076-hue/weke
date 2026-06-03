// إرسال إشعارات Push عبر Firebase Cloud Messaging (FCM)
// اختياري: إن لم تُضبط بيانات حساب الخدمة، يبقى السيرفر يعمل والإشعارات عند الإغلاق معطّلة فقط.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let messaging = null;
let enabled = false;

function loadCredentials() {
  // 1) متغيّر بيئة يحوي محتوى JSON (الأنسب على Railway)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      console.log('⚠️  FIREBASE_SERVICE_ACCOUNT ليس JSON صالحاً');
    }
  }
  // 2) مسار ملف عبر متغيّر بيئة
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (envPath && fs.existsSync(envPath)) {
    try {
      return JSON.parse(fs.readFileSync(envPath, 'utf8'));
    } catch {}
  }
  // 3) ملف service-account.json بجانب السيرفر
  const localPath = path.join(__dirname, 'service-account.json');
  if (fs.existsSync(localPath)) {
    try {
      return JSON.parse(fs.readFileSync(localPath, 'utf8'));
    } catch {}
  }
  return null;
}

async function init() {
  const cred = loadCredentials();
  if (!cred) {
    console.log('ℹ️  FCM غير مُفعّل (لا توجد بيانات حساب خدمة) — الإشعارات عند الإغلاق التام معطّلة.');
    return;
  }
  try {
    const mod = await import('firebase-admin');
    const admin = mod.default || mod;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    }
    messaging = admin.messaging();
    enabled = true;
    console.log('✅ FCM مُفعّل — الإشعارات عند الإغلاق تعمل');
  } catch (e) {
    console.log('⚠️  تعذّر تفعيل FCM:', e.message);
  }
}

await init();

export const fcmEnabled = () => enabled;

export function saveDeviceToken(userId, token, platform = 'android') {
  if (!token) return;
  db.prepare(
    `INSERT INTO device_tokens (token, user_id, platform, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at`
  ).run(token, userId, platform, Date.now());
}

function tokensForUsers(userIds) {
  if (!userIds.length) return [];
  const placeholders = userIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT token FROM device_tokens WHERE user_id IN (${placeholders})`)
    .all(...userIds);
  return rows.map((r) => r.token);
}

export async function notifyUsers(userIds, { title, body, data }) {
  if (!enabled || !messaging || !userIds.length) return;
  const tokens = tokensForUsers(userIds);
  if (!tokens.length) return;

  // FCM يتطلب أن تكون قيم data نصوصاً
  const stringData = {};
  for (const [k, v] of Object.entries(data || {})) stringData[k] = String(v);

  try {
    const resp = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: { channelId: 'lasilki_radio', sound: 'default' },
      },
    });
    // احذف الرموز غير الصالحة
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token') ||
          code.includes('invalid-argument')
        ) {
          db.prepare('DELETE FROM device_tokens WHERE token = ?').run(tokens[i]);
        }
      }
    });
  } catch (e) {
    console.log('FCM send error:', e.message);
  }
}
