// طبقة قاعدة البيانات — تعتمد على node:sqlite المدمجة في Node (لا حاجة لأي مكتبة خارجية تحتاج بناء)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// مجلد البيانات. على Railway: اضبط DATA_DIR=/data واربط Volume على /data لحفظ القاعدة والتسجيلات بعد إعادة التشغيل
export const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'lasilki.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    pass_hash    TEXT NOT NULL,
    pass_salt    TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by  INTEGER,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memberships (
    user_id    INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    joined_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    username    TEXT NOT NULL,
    file        TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS device_tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    platform   TEXT NOT NULL DEFAULT 'android',
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_memberships_channel ON memberships(channel_id);
`);

// إنشاء قناة عامة افتراضية إن لم توجد أي قناة
const channelCount = db.prepare('SELECT COUNT(*) AS c FROM channels').get().c;
if (channelCount === 0) {
  db.prepare(
    'INSERT INTO channels (name, description, created_by, created_at) VALUES (?, ?, ?, ?)'
  ).run('عام', 'القناة العامة للجميع', null, Date.now());
}

export default db;
