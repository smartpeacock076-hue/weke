// عميل اختبار: يحاكي مستخدمَين على نفس القناة — أحدهما يتحدث والآخر يستقبل
// يتحقق من: التسجيل، الدخول، WebSocket، المصادقة، الانضمام، الحضور، بثّ الصوت، السجل
import { WebSocket } from 'ws';

const BASE = process.env.BASE || 'http://localhost:4000';
const WS = BASE.replace('http', 'ws');

async function api(path, body, token) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function rnd() {
  return Math.floor(performance.now() * 1000) % 100000;
}

function wsConnect(token, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'auth_ok') {
        console.log(`[${name}] ✅ مصادقة ناجحة`);
        resolve(ws);
      } else if (m.type === 'auth_err') {
        reject(new Error('auth failed'));
      } else {
        console.log(`[${name}] ⬅️  ${m.type}`, m.user ? `(${m.user.displayName})` : '', m.online ? `online=${m.online.length}` : '');
      }
    });
    ws.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const suffix = rnd();
  const ua = `talker${suffix}`;
  const ub = `listener${suffix}`;

  console.log('— تسجيل مستخدمين —');
  const ra = await api('/api/register', { username: ua, password: 'pass123', displayName: 'المتحدث' });
  const rb = await api('/api/register', { username: ub, password: 'pass123', displayName: 'المستمع' });
  console.log('  المتحدث token:', ra.token ? 'OK' : ra.error);
  console.log('  المستمع token:', rb.token ? 'OK' : rb.error);

  console.log('— القنوات المتاحة —');
  const ch = await api('/api/channels', null, ra.token);
  console.log('  ', ch.channels.map((c) => `${c.id}:${c.name}(أعضاء ${c.members})`).join(', '));
  const channelId = ch.channels[0].id;

  console.log(`— اتصال WebSocket والانضمام للقناة ${channelId} —`);
  const wsA = await wsConnect(ra.token, 'المتحدث');
  const wsB = await wsConnect(rb.token, 'المستمع');
  wsA.send(JSON.stringify({ type: 'join', channelId }));
  wsB.send(JSON.stringify({ type: 'join', channelId }));
  await sleep(300);

  console.log('— المتحدث يبدأ الإرسال ويبثّ صوتاً وهمياً —');
  let received = { talk_start: 0, audio: 0, talk_end: 0, history_new: 0 };
  wsB.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (received[m.type] !== undefined) received[m.type]++;
  });

  wsA.send(JSON.stringify({ type: 'talk_start', channelId }));
  // 10 دفعات PCM وهمية (640 بايت لكل دفعة = 20ms عند 16kHz)
  const fakeChunk = Buffer.alloc(640, 1).toString('base64');
  for (let i = 0; i < 10; i++) {
    wsA.send(JSON.stringify({ type: 'audio', channelId, chunk: fakeChunk }));
    await sleep(20);
  }
  wsA.send(JSON.stringify({ type: 'talk_end', channelId }));
  await sleep(400);

  console.log('— ما استقبله المستمع —');
  console.log('  ', JSON.stringify(received));

  console.log('— سجل القناة بعد الإرسال —');
  const hist = await api(`/api/channels/${channelId}/history`, null, rb.token);
  console.log('  عدد الرسائل:', hist.messages.length, hist.messages[0] ? `(آخرها ${hist.messages[0].durationMs}ms من ${hist.messages[0].username})` : '');

  const ok =
    received.talk_start >= 1 &&
    received.audio >= 8 &&
    received.talk_end >= 1 &&
    received.history_new >= 1 &&
    hist.messages.length >= 1;
  console.log(ok ? '\n🎉 نجح الاختبار: البثّ الصوتي والسجل يعملان' : '\n❌ فشل الاختبار');

  wsA.close();
  wsB.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('خطأ:', e.message);
  process.exit(1);
});
