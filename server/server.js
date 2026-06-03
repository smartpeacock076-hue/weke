// سيرفر لاسلكي (Lasilki / Zello-like): REST + WebSocket لبثّ صوت PCM لحظي بين أعضاء القناة
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import db, { DATA_DIR } from './db.js';
import {
  hashPassword,
  verifyPassword,
  createToken,
  userFromToken,
} from './auth.js';
import { writeWav } from './wav.js';
import { saveDeviceToken, notifyUsers, fcmEnabled } from './fcm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const PORT = process.env.PORT || 4000;
const MAX_TALK_BYTES = 16000 * 2 * 300; // حد أقصى ~5 دقائق للإرسال الواحد

/* ----------------------------- أدوات مساعدة ----------------------------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function getToken(req, url) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return url.searchParams.get('token');
}

function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.displayName || u.display_name };
}

function channelDTO(row, userId) {
  const members = db
    .prepare('SELECT COUNT(*) AS c FROM memberships WHERE channel_id = ?')
    .get(row.id).c;
  const joined = userId
    ? !!db
        .prepare('SELECT 1 FROM memberships WHERE channel_id = ? AND user_id = ?')
        .get(row.id, userId)
    : false;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    members: Number(members),
    joined,
    online: presenceList(row.id).length,
  };
}

/* ------------------------------ REST API ------------------------------ */
async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // تسجيل حساب جديد
  if (pathname === '/api/register' && method === 'POST') {
    const { username, password, displayName } = await readBody(req);
    if (!username || !password) return sendJson(res, 400, { error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) return sendJson(res, 409, { error: 'اسم المستخدم محجوز' });
    const { hash, salt } = hashPassword(password);
    const info = db
      .prepare(
        'INSERT INTO users (username, display_name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(username, displayName || username, hash, salt, Date.now());
    const userId = Number(info.lastInsertRowid);
    // الانضمام التلقائي لجميع القنوات العامة الموجودة (لتجربة فورية)
    const generalChannels = db.prepare('SELECT id FROM channels').all();
    for (const ch of generalChannels) {
      db.prepare(
        'INSERT OR IGNORE INTO memberships (user_id, channel_id, joined_at) VALUES (?, ?, ?)'
      ).run(userId, ch.id, Date.now());
    }
    const token = createToken(userId);
    return sendJson(res, 200, {
      token,
      user: { id: userId, username, displayName: displayName || username },
    });
  }

  // تسجيل الدخول
  if (pathname === '/api/login' && method === 'POST') {
    const { username, password } = await readBody(req);
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
    if (!u || !verifyPassword(password || '', u.pass_hash, u.pass_salt)) {
      return sendJson(res, 401, { error: 'بيانات الدخول غير صحيحة' });
    }
    const token = createToken(u.id);
    return sendJson(res, 200, {
      token,
      user: { id: u.id, username: u.username, displayName: u.display_name },
    });
  }

  // من هنا فصاعداً جميع المسارات تتطلب مصادقة
  const me = userFromToken(getToken(req, url));
  if (!me) return sendJson(res, 401, { error: 'غير مصرّح' });

  if (pathname === '/api/me' && method === 'GET') {
    return sendJson(res, 200, { user: publicUser(me) });
  }

  // تسجيل رمز الجهاز لإشعارات FCM
  if (pathname === '/api/register-push' && method === 'POST') {
    const { token } = await readBody(req);
    saveDeviceToken(me.id, token);
    return sendJson(res, 200, { ok: true });
  }

  // قائمة القنوات
  if (pathname === '/api/channels' && method === 'GET') {
    const rows = db.prepare('SELECT * FROM channels ORDER BY name').all();
    return sendJson(res, 200, { channels: rows.map((r) => channelDTO(r, me.id)) });
  }

  // إنشاء قناة
  if (pathname === '/api/channels' && method === 'POST') {
    const { name, description } = await readBody(req);
    if (!name || !name.trim()) return sendJson(res, 400, { error: 'اسم القناة مطلوب' });
    const exists = db.prepare('SELECT 1 FROM channels WHERE name = ?').get(name.trim());
    if (exists) return sendJson(res, 409, { error: 'اسم القناة محجوز' });
    const info = db
      .prepare('INSERT INTO channels (name, description, created_by, created_at) VALUES (?, ?, ?, ?)')
      .run(name.trim(), description || '', me.id, Date.now());
    const channelId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO memberships (user_id, channel_id, joined_at) VALUES (?, ?, ?)').run(
      me.id,
      channelId,
      Date.now()
    );
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    return sendJson(res, 200, { channel: channelDTO(row, me.id) });
  }

  // انضمام / مغادرة قناة + سجل + أعضاء
  const mChannel = pathname.match(/^\/api\/channels\/(\d+)\/(join|leave|history|members)$/);
  if (mChannel) {
    const channelId = Number(mChannel[1]);
    const action = mChannel[2];
    const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!ch) return sendJson(res, 404, { error: 'القناة غير موجودة' });

    if (action === 'join' && method === 'POST') {
      db.prepare(
        'INSERT OR IGNORE INTO memberships (user_id, channel_id, joined_at) VALUES (?, ?, ?)'
      ).run(me.id, channelId, Date.now());
      return sendJson(res, 200, { ok: true, channel: channelDTO(ch, me.id) });
    }
    if (action === 'leave' && method === 'POST') {
      db.prepare('DELETE FROM memberships WHERE user_id = ? AND channel_id = ?').run(me.id, channelId);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'history' && method === 'GET') {
      const rows = db
        .prepare(
          'SELECT id, user_id AS userId, username, file, duration_ms AS durationMs, created_at AS createdAt FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 50'
        )
        .all(channelId);
      return sendJson(res, 200, { messages: rows });
    }
    if (action === 'members' && method === 'GET') {
      const rows = db
        .prepare(
          `SELECT u.id, u.username, u.display_name AS displayName
           FROM memberships m JOIN users u ON u.id = m.user_id
           WHERE m.channel_id = ? ORDER BY u.display_name`
        )
        .all(channelId);
      const onlineIds = new Set(presenceList(channelId).map((p) => p.id));
      return sendJson(
        res,
        200,
        { members: rows.map((r) => ({ ...r, online: onlineIds.has(r.id) })) }
      );
    }
  }

  return sendJson(res, 404, { error: 'غير موجود' });
}

/* --------------------------- خدمة ملفات الصوت --------------------------- */
function serveUpload(req, res, url) {
  const me = userFromToken(getToken(req, url));
  if (!me) return sendJson(res, 401, { error: 'غير مصرّح' });
  const name = path.basename(decodeURIComponent(url.pathname.replace('/uploads/', '')));
  const filePath = path.join(UPLOADS, name);
  if (!filePath.startsWith(UPLOADS) || !fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'الملف غير موجود' });
  }
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'audio/wav',
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------ HTTP server ------------------------------ */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/' || url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'lasilki', fcm: fcmEnabled(), time: Date.now() });
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url).catch((e) => {
    console.error(e);
    sendJson(res, 500, { error: 'خطأ في السيرفر' });
  });
  if (url.pathname.startsWith('/uploads/')) return serveUpload(req, res, url);
  sendJson(res, 404, { error: 'غير موجود' });
});

/* ------------------------------ WebSocket ------------------------------ */
const wss = new WebSocketServer({ server });

// الحالة في الذاكرة
const channelSockets = new Map(); // channelId -> Set<ws>
const talkSessions = new Map(); // channelId -> { user, chunks: [], bytes, startedAt }

function presenceList(channelId) {
  const set = channelSockets.get(channelId);
  if (!set) return [];
  const seen = new Map();
  for (const ws of set) {
    if (ws.user) seen.set(ws.user.id, publicUser(ws.user));
  }
  return [...seen.values()];
}

function broadcastToChannel(channelId, obj, exceptWs) {
  const set = channelSockets.get(channelId);
  if (!set) return;
  const msg = JSON.stringify(obj);
  for (const ws of set) {
    if (ws !== exceptWs && ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function broadcastPresence(channelId) {
  broadcastToChannel(channelId, {
    type: 'presence',
    channelId,
    online: presenceList(channelId),
  });
}

function leaveChannel(ws) {
  const cid = ws.channelId;
  if (cid == null) return;
  const set = channelSockets.get(cid);
  if (set) {
    set.delete(ws);
    if (set.size === 0) channelSockets.delete(cid);
  }
  // إن كان هو المتحدث الحالي، أنهِ الإرسال
  const session = talkSessions.get(cid);
  if (session && ws.user && session.user.id === ws.user.id) {
    finalizeTalk(cid);
  }
  ws.channelId = null;
  broadcastPresence(cid);
}

function finalizeTalk(channelId) {
  const session = talkSessions.get(channelId);
  if (!session) return;
  talkSessions.delete(channelId);
  const pcm = Buffer.concat(session.chunks);
  let message = null;
  if (pcm.length > 0) {
    const fileName = `msg_${channelId}_${session.startedAt}_${session.user.id}.wav`;
    const durationMs = writeWav(path.join(UPLOADS, fileName), pcm);
    const info = db
      .prepare(
        'INSERT INTO messages (channel_id, user_id, username, file, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(channelId, session.user.id, session.user.username, fileName, durationMs, Date.now());
    message = {
      id: Number(info.lastInsertRowid),
      userId: session.user.id,
      username: session.user.username,
      file: fileName,
      durationMs,
      createdAt: Date.now(),
    };
  }
  broadcastToChannel(channelId, {
    type: 'talk_end',
    channelId,
    user: publicUser(session.user),
  });
  if (message) {
    broadcastToChannel(channelId, { type: 'history_new', channelId, message });
  }
}

const lastFcmNotify = new Map(); // channelId -> ts (تحديد المعدّل)

// إشعار أعضاء القناة غير المتصلين حالياً عبر FCM (يصلهم حتى والتطبيق مغلق)
function notifyOfflineMembers(channelId, talker) {
  const now = Date.now();
  if (now - (lastFcmNotify.get(channelId) || 0) < 20000) return; // إشعار واحد كحدّ أقصى كل 20 ثانية
  lastFcmNotify.set(channelId, now);

  const connectedIds = new Set(presenceList(channelId).map((p) => p.id));
  const offlineIds = db
    .prepare('SELECT user_id FROM memberships WHERE channel_id = ?')
    .all(channelId)
    .map((r) => r.user_id)
    .filter((id) => id !== talker.id && !connectedIds.has(id));
  if (!offlineIds.length) return;

  const ch = db.prepare('SELECT name FROM channels WHERE id = ?').get(channelId);
  notifyUsers(offlineIds, {
    title: ch?.name ? `📻 ${ch.name}` : '📻 لاسلكي',
    body: `📢 ${talker.displayName} يتحدث الآن`,
    data: { channelId, type: 'talk_start', channelName: ch?.name || '' },
  });
}

wss.on('connection', (ws) => {
  ws.user = null;
  ws.channelId = null;
  ws.isAlive = true;

  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // المصادقة أولاً
    if (msg.type === 'auth') {
      const u = userFromToken(msg.token);
      if (!u) {
        ws.send(JSON.stringify({ type: 'auth_err', error: 'رمز غير صالح' }));
        return ws.close();
      }
      ws.user = u;
      return ws.send(JSON.stringify({ type: 'auth_ok', user: publicUser(u) }));
    }

    if (!ws.user) {
      return ws.send(JSON.stringify({ type: 'error', error: 'يجب المصادقة أولاً' }));
    }

    switch (msg.type) {
      case 'join': {
        const channelId = Number(msg.channelId);
        if (ws.channelId != null && ws.channelId !== channelId) leaveChannel(ws);
        ws.channelId = channelId;
        if (!channelSockets.has(channelId)) channelSockets.set(channelId, new Set());
        channelSockets.get(channelId).add(ws);
        // أبلغ المنضم الجديد بمن يتحدث الآن (إن وُجد) ثم حدّث الحضور للجميع
        const active = talkSessions.get(channelId);
        if (active) {
          ws.send(
            JSON.stringify({ type: 'talk_start', channelId, user: publicUser(active.user) })
          );
        }
        broadcastPresence(channelId);
        break;
      }

      case 'leave': {
        leaveChannel(ws);
        break;
      }

      case 'talk_start': {
        const channelId = ws.channelId;
        if (channelId == null) break;
        const active = talkSessions.get(channelId);
        if (active && active.user.id !== ws.user.id) {
          // القناة مشغولة — متحدث آخر
          ws.send(
            JSON.stringify({ type: 'busy', channelId, user: publicUser(active.user) })
          );
          break;
        }
        if (!active) {
          talkSessions.set(channelId, {
            user: ws.user,
            chunks: [],
            bytes: 0,
            startedAt: Date.now(),
          });
          broadcastToChannel(
            channelId,
            { type: 'talk_start', channelId, user: publicUser(ws.user) },
            ws
          );
          notifyOfflineMembers(channelId, ws.user);
        }
        break;
      }

      case 'audio': {
        const channelId = ws.channelId;
        if (channelId == null) break;
        const session = talkSessions.get(channelId);
        if (!session || session.user.id !== ws.user.id) break; // فقط المتحدث الحالي
        if (typeof msg.chunk === 'string' && msg.chunk.length) {
          const buf = Buffer.from(msg.chunk, 'base64');
          if (session.bytes + buf.length <= MAX_TALK_BYTES) {
            session.chunks.push(buf);
            session.bytes += buf.length;
          }
          // أعد البثّ للبقية لحظياً
          broadcastToChannel(
            channelId,
            { type: 'audio', channelId, user: publicUser(ws.user), chunk: msg.chunk },
            ws
          );
        }
        break;
      }

      case 'talk_end': {
        const channelId = ws.channelId;
        if (channelId == null) break;
        const session = talkSessions.get(channelId);
        if (session && session.user.id === ws.user.id) {
          finalizeTalk(channelId);
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (ws.channelId != null) leaveChannel(ws);
  });
  ws.on('error', () => {});
});

// نبضات للحفاظ على الاتصالات وإزالة الميتة
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, 30000);
wss.on('close', () => clearInterval(interval));

server.listen(PORT, () => {
  console.log(`✅ سيرفر لاسلكي يعمل على المنفذ ${PORT}`);
  console.log(`   REST:  http://localhost:${PORT}/api`);
  console.log(`   WS:    ws://localhost:${PORT}`);
});
