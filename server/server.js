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

function areFriends(a, b) {
  return !!db
    .prepare(
      `SELECT 1 FROM friendships WHERE status='accepted' AND
       ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))`,
    )
    .get(a, b, b, a);
}

function isMember(channelId, userId) {
  return !!db
    .prepare('SELECT 1 FROM memberships WHERE channel_id=? AND user_id=?')
    .get(channelId, userId);
}

function channelDTO(row, userId) {
  const memberCount = Number(
    db.prepare('SELECT COUNT(*) AS c FROM memberships WHERE channel_id = ?').get(row.id).c,
  );
  let display = row.title || row.name;
  if (row.type === 'dm') {
    const other = db
      .prepare(
        `SELECT u.display_name AS displayName FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = ? AND m.user_id != ? LIMIT 1`,
      )
      .get(row.id, userId);
    display = other ? other.displayName : 'محادثة';
  }
  return {
    id: row.id,
    name: display,
    type: row.type || 'group',
    description: row.description || '',
    members: memberCount,
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

  // محادثاتي فقط (مجموعات + فردي) — لا قنوات عامة
  if (pathname === '/api/channels' && method === 'GET') {
    const rows = db
      .prepare(
        `SELECT c.* FROM channels c
         JOIN memberships m ON m.channel_id = c.id
         WHERE m.user_id = ?
         ORDER BY c.created_at DESC`,
      )
      .all(me.id);
    return sendJson(res, 200, { channels: rows.map((r) => channelDTO(r, me.id)) });
  }

  // إنشاء مجموعة خاصة
  if (pathname === '/api/channels' && method === 'POST') {
    const { name } = await readBody(req);
    const title = (name || '').trim();
    if (!title) return sendJson(res, 400, { error: 'اسم المجموعة مطلوب' });
    const internal = `g_${Date.now()}_${me.id}`;
    const info = db
      .prepare(
        "INSERT INTO channels (name, title, type, description, created_by, created_at) VALUES (?, ?, 'group', '', ?, ?)",
      )
      .run(internal, title, me.id, Date.now());
    const channelId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO memberships (user_id, channel_id, joined_at) VALUES (?, ?, ?)').run(
      me.id,
      channelId,
      Date.now(),
    );
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    return sendJson(res, 200, { channel: channelDTO(row, me.id) });
  }

  // بحث المستخدمين بالاسم (لإضافة صديق)
  if (pathname === '/api/users/search' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return sendJson(res, 200, { users: [] });
    const like = '%' + q + '%';
    const rows = db
      .prepare(
        `SELECT id, username, display_name AS displayName FROM users
         WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? ORDER BY username LIMIT 20`,
      )
      .all(like, like, me.id);
    const users = rows.map((u) => {
      let status = 'none';
      const fr = db
        .prepare(
          `SELECT requester_id, status FROM friendships WHERE
           (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`,
        )
        .get(me.id, u.id, u.id, me.id);
      if (fr) {
        status = fr.status === 'accepted' ? 'friends' : fr.requester_id === me.id ? 'requested' : 'incoming';
      }
      return { ...u, status };
    });
    return sendJson(res, 200, { users });
  }

  // قائمة الأصدقاء
  if (pathname === '/api/friends' && method === 'GET') {
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.display_name AS displayName FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END
         WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?)
         ORDER BY u.display_name`,
      )
      .all(me.id, me.id, me.id);
    return sendJson(res, 200, { friends: rows });
  }

  // طلبات الصداقة الواردة
  if (pathname === '/api/friends/requests' && method === 'GET') {
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.display_name AS displayName FROM friendships f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id=? AND f.status='pending' ORDER BY f.created_at DESC`,
      )
      .all(me.id);
    return sendJson(res, 200, { requests: rows });
  }

  // إرسال طلب صداقة بالاسم
  if (pathname === '/api/friends/request' && method === 'POST') {
    const { username } = await readBody(req);
    const target = db.prepare('SELECT id FROM users WHERE username=?').get((username || '').trim());
    if (!target) return sendJson(res, 404, { error: 'المستخدم غير موجود' });
    if (target.id === me.id) return sendJson(res, 400, { error: 'لا يمكنك إضافة نفسك' });
    const incoming = db
      .prepare("SELECT id FROM friendships WHERE requester_id=? AND addressee_id=? AND status='pending'")
      .get(target.id, me.id);
    if (incoming) {
      db.prepare("UPDATE friendships SET status='accepted' WHERE id=?").run(incoming.id);
      return sendJson(res, 200, { ok: true, status: 'friends' });
    }
    db.prepare(
      "INSERT OR IGNORE INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)",
    ).run(me.id, target.id, Date.now());
    return sendJson(res, 200, { ok: true, status: 'requested' });
  }

  // قبول طلب صداقة
  if (pathname === '/api/friends/accept' && method === 'POST') {
    const { userId } = await readBody(req);
    const r = db
      .prepare("UPDATE friendships SET status='accepted' WHERE requester_id=? AND addressee_id=? AND status='pending'")
      .run(Number(userId), me.id);
    return sendJson(res, 200, { ok: r.changes > 0 });
  }

  // رفض طلب صداقة
  if (pathname === '/api/friends/reject' && method === 'POST') {
    const { userId } = await readBody(req);
    db.prepare("DELETE FROM friendships WHERE requester_id=? AND addressee_id=? AND status='pending'").run(
      Number(userId),
      me.id,
    );
    return sendJson(res, 200, { ok: true });
  }

  // فتح/إنشاء محادثة فردية مع صديق
  if (pathname === '/api/dm' && method === 'POST') {
    const { username } = await readBody(req);
    const other = db
      .prepare('SELECT id, display_name AS displayName FROM users WHERE username=?')
      .get((username || '').trim());
    if (!other) return sendJson(res, 404, { error: 'المستخدم غير موجود' });
    if (other.id === me.id) return sendJson(res, 400, { error: 'لا يمكنك محادثة نفسك' });
    if (!areFriends(me.id, other.id)) return sendJson(res, 403, { error: 'أضِفه صديقاً أولاً' });
    const a = Math.min(me.id, other.id);
    const b = Math.max(me.id, other.id);
    const internal = `dm_${a}_${b}`;
    let row = db.prepare('SELECT * FROM channels WHERE name=?').get(internal);
    if (!row) {
      const info = db
        .prepare(
          "INSERT INTO channels (name, title, type, description, created_by, created_at) VALUES (?, '', 'dm', '', ?, ?)",
        )
        .run(internal, me.id, Date.now());
      const cid = Number(info.lastInsertRowid);
      db.prepare('INSERT OR IGNORE INTO memberships (user_id, channel_id, joined_at) VALUES (?, ?, ?)').run(me.id, cid, Date.now());
      db.prepare('INSERT OR IGNORE INTO memberships (user_id, channel_id, joined_at) VALUES (?, ?, ?)').run(other.id, cid, Date.now());
      row = db.prepare('SELECT * FROM channels WHERE id=?').get(cid);
    }
    return sendJson(res, 200, { channel: channelDTO(row, me.id) });
  }

  // إجراءات المحادثة الخاصة (يجب أن تكون عضواً)
  const mChannel = pathname.match(/^\/api\/channels\/(\d+)\/(leave|history|members|invite)$/);
  if (mChannel) {
    const channelId = Number(mChannel[1]);
    const action = mChannel[2];
    const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!ch) return sendJson(res, 404, { error: 'المحادثة غير موجودة' });
    if (!isMember(channelId, me.id)) return sendJson(res, 403, { error: 'لست عضواً في هذه المحادثة' });

    if (action === 'leave' && method === 'POST') {
      db.prepare('DELETE FROM memberships WHERE user_id = ? AND channel_id = ?').run(me.id, channelId);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'history' && method === 'GET') {
      const rows = db
        .prepare(
          'SELECT id, user_id AS userId, username, file, duration_ms AS durationMs, created_at AS createdAt FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 50',
        )
        .all(channelId);
      return sendJson(res, 200, { messages: rows });
    }
    if (action === 'members' && method === 'GET') {
      const rows = db
        .prepare(
          `SELECT u.id, u.username, u.display_name AS displayName
           FROM memberships m JOIN users u ON u.id = m.user_id
           WHERE m.channel_id = ? ORDER BY u.display_name`,
        )
        .all(channelId);
      const onlineIds = new Set(presenceList(channelId).map((p) => p.id));
      return sendJson(res, 200, { members: rows.map((r) => ({ ...r, online: onlineIds.has(r.id) })) });
    }
    if (action === 'invite' && method === 'POST') {
      if ((ch.type || 'group') === 'dm') return sendJson(res, 400, { error: 'لا يمكن الدعوة في محادثة فردية' });
      const { username } = await readBody(req);
      const target = db.prepare('SELECT id FROM users WHERE username=?').get((username || '').trim());
      if (!target) return sendJson(res, 404, { error: 'المستخدم غير موجود' });
      if (!areFriends(me.id, target.id)) return sendJson(res, 403, { error: 'يمكن دعوة الأصدقاء فقط' });
      db.prepare('INSERT OR IGNORE INTO memberships (user_id, channel_id, joined_at) VALUES (?, ?, ?)').run(target.id, channelId, Date.now());
      return sendJson(res, 200, { ok: true });
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

  const ch = db.prepare('SELECT type, title FROM channels WHERE id = ?').get(channelId);
  // في الفردي يرى المستقبل اسم المتحدث؛ في المجموعة يرى اسم المجموعة
  const display = ch?.type === 'dm' ? talker.displayName : ch?.title || 'مجموعة';
  notifyUsers(offlineIds, {
    title: `📻 ${display}`,
    body: `📢 ${talker.displayName} يتحدث الآن`,
    data: { channelId, type: 'talk_start', channelName: display },
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
        if (!isMember(channelId, ws.user.id)) {
          ws.send(JSON.stringify({ type: 'error', error: 'لست عضواً في هذه المحادثة' }));
          break;
        }
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
