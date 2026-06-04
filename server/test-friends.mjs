// اختبار نموذج الخصوصية: صداقة + بحث + محادثة فردية + مجموعة + بثّ صوتي
import {WebSocket} from 'ws';

const BASE = process.env.BASE || 'http://localhost:4000';
const WS = BASE.replace('http', 'ws');

async function api(path, body, token, method) {
  const res = await fetch(BASE + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  return {status: res.status, data: await res.json().catch(() => ({}))};
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = () => Math.floor(performance.now() * 1000) % 100000;

function wsAuth(token, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    ws.on('open', () => ws.send(JSON.stringify({type: 'auth', token})));
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'auth_ok') resolve(ws);
      else if (m.type === 'auth_err') reject(new Error('auth failed'));
    });
    ws.on('error', reject);
  });
}

let pass = 0, fail = 0;
function check(cond, label) {
  if (cond) { pass++; console.log('  ✅', label); }
  else { fail++; console.log('  ❌', label); }
}

(async () => {
  const s = rnd();
  const ua = `ahmad${s}`, ub = `sara${s}`;

  console.log('— تسجيل مستخدمين —');
  const ra = (await api('/api/register', {username: ua, password: 'p', displayName: 'أحمد'})).data;
  const rb = (await api('/api/register', {username: ub, password: 'p', displayName: 'سارة'})).data;
  check(ra.token && rb.token, 'تسجيل أحمد وسارة');

  console.log('— لا قنوات عامة (الخصوصية) —');
  const chA0 = (await api('/api/channels', null, ra.token)).data;
  check(chA0.channels.length === 0, 'قائمة محادثات أحمد فارغة في البداية');

  console.log('— بحث أحمد عن سارة بالاسم —');
  const search = (await api(`/api/users/search?q=${ub}`, null, ra.token)).data;
  check(search.users.length === 1 && search.users[0].username === ub, 'وجد أحمد سارة بالبحث');
  check(search.users[0].status === 'none', 'الحالة: ليسا صديقين بعد');

  console.log('— أحمد يرسل طلب صداقة لسارة —');
  const req = (await api('/api/friends/request', {username: ub}, ra.token)).data;
  check(req.status === 'requested', 'أُرسل الطلب');

  const reqs = (await api('/api/friends/requests', null, rb.token)).data;
  check(reqs.requests.length === 1 && reqs.requests[0].username === ua, 'سارة ترى الطلب الوارد');

  console.log('— سارة تقبل —');
  const acc = (await api('/api/friends/accept', {userId: ra.user.id}, rb.token)).data;
  check(acc.ok, 'قبلت سارة الطلب');

  const friendsA = (await api('/api/friends', null, ra.token)).data;
  check(friendsA.friends.length === 1 && friendsA.friends[0].username === ub, 'سارة في قائمة أصدقاء أحمد');

  console.log('— محادثة فردية بين أحمد وسارة + بثّ صوتي —');
  const dm = (await api('/api/dm', {username: ub}, ra.token)).data;
  check(dm.channel && dm.channel.type === 'dm', 'أُنشئت محادثة فردية');
  check(dm.channel.name === 'سارة', 'تظهر باسم الطرف الآخر (سارة) عند أحمد');
  const dmId = dm.channel.id;

  // سارة ترى نفس المحادثة باسم أحمد
  const chB = (await api('/api/channels', null, rb.token)).data;
  const dmForB = chB.channels.find(c => c.id === dmId);
  check(dmForB && dmForB.name === 'أحمد', 'تظهر عند سارة باسم أحمد');

  const wsA = await wsAuth(ra.token, 'أحمد');
  const wsB = await wsAuth(rb.token, 'سارة');
  wsA.send(JSON.stringify({type: 'join', channelId: dmId}));
  wsB.send(JSON.stringify({type: 'join', channelId: dmId}));
  await sleep(300);

  let got = {talk_start: 0, audio: 0, talk_end: 0};
  wsB.on('message', raw => { const m = JSON.parse(raw.toString()); if (got[m.type] !== undefined) got[m.type]++; });
  wsA.send(JSON.stringify({type: 'talk_start', channelId: dmId}));
  const chunk = Buffer.alloc(640, 1).toString('base64');
  for (let i = 0; i < 8; i++) { wsA.send(JSON.stringify({type: 'audio', channelId: dmId, chunk})); await sleep(20); }
  wsA.send(JSON.stringify({type: 'talk_end', channelId: dmId}));
  await sleep(400);
  check(got.talk_start >= 1 && got.audio >= 6 && got.talk_end >= 1, 'سارة استقبلت صوت أحمد في المحادثة الفردية');

  console.log('— منع غير العضو من السماع —');
  const rc = (await api('/api/register', {username: `dakhil${s}`, password: 'p', displayName: 'دخيل'})).data;
  const wsC = await wsAuth(rc.token, 'دخيل');
  let intruderError = false;
  wsC.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.type === 'error') intruderError = true; });
  wsC.send(JSON.stringify({type: 'join', channelId: dmId}));
  await sleep(300);
  check(intruderError, 'رُفض انضمام شخص ليس عضواً في المحادثة');

  console.log('— إنشاء مجموعة ودعوة صديق —');
  const grp = (await api('/api/channels', {name: 'العائلة'}, ra.token)).data;
  check(grp.channel && grp.channel.type === 'group' && grp.channel.name === 'العائلة', 'أُنشئت مجموعة «العائلة»');
  const inv = await api(`/api/channels/${grp.channel.id}/invite`, {username: ub}, ra.token);
  check(inv.data.ok, 'دُعيت سارة للمجموعة');
  const chB2 = (await api('/api/channels', null, rb.token)).data;
  check(chB2.channels.some(c => c.id === grp.channel.id), 'المجموعة ظهرت عند سارة');

  wsA.close(); wsB.close(); wsC.close();
  console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
  console.log(fail === 0 ? '🎉 كل اختبارات الخصوصية نجحت' : '❌ توجد إخفاقات');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('خطأ:', e.message); process.exit(1); });
