import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Sound from 'react-native-sound';
import {colors, radius} from '../theme';
import {
  audioUrl,
  getHistory,
  getMembers,
  getUser,
  Member,
  Message,
  User,
} from '../api';
import {radio} from '../ws';
import {ensureMicPermission, player, startCapture, stopCapture, vibrate} from '../audio';
import {ensureNotificationPermission, radioService} from '../service';

Sound.setCategory('Playback');

// أندرويد: بثّ صوتي لحظي عبر الوحدة الأصلية. iOS: تشغيل التسجيل فور وصوله (موثوق بلا كود أصلي).
const isAndroid = Platform.OS === 'android';

type Tab = 'history' | 'members';

export default function ChannelScreen({route, navigation}: any) {
  const {id: channelId, name} = route.params;
  const me = getUser() as User;

  const [tab, setTab] = useState<Tab>('history');
  const [history, setHistory] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [online, setOnline] = useState<User[]>([]);
  const [talkingUser, setTalkingUser] = useState<User | null>(null);
  const [transmitting, setTransmitting] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const transmittingRef = useRef(false);
  const talkingRef = useRef<User | null>(null);
  const soundRef = useRef<any>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    transmittingRef.current = transmitting;
  }, [transmitting]);
  useEffect(() => {
    talkingRef.current = talkingUser;
  }, [talkingUser]);

  // حركة نبض حول زر التحدّث عند الإرسال أو الاستقبال
  useEffect(() => {
    if (transmitting || talkingUser) {
      const loop = Animated.loop(
        Animated.timing(pulse, {toValue: 1, duration: 1100, useNativeDriver: true}),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
  }, [transmitting, talkingUser, pulse]);

  // الانضمام للقناة + تحميل البيانات + طلب إذن الميكروفون مسبقاً
  useEffect(() => {
    radio.join(channelId);
    ensureNotificationPermission();
    // ابدأ خدمة الخلفية (نوع ميكروفون) فقط بعد منح إذن الميكروفون — يتفادى كراش أندرويد 14
    ensureMicPermission().then(ok => {
      if (ok) radioService.start(name, 'متصل بالقناة');
    });
    (async () => {
      try {
        const [h, m] = await Promise.all([getHistory(channelId), getMembers(channelId)]);
        setHistory(h);
        setMembers(m);
        setOnline(m.filter(x => x.online).map(x => ({id: x.id, username: x.username, displayName: x.displayName})));
      } catch {}
    })();

    const offTalkStart = radio.on('talk_start', (msg: any) => {
      if (msg.channelId !== channelId || msg.user.id === me.id) return;
      setTalkingUser(msg.user);
      vibrate(60);
      if (isAndroid) player.start(); // بثّ لحظي (أندرويد)
      radioService.update(name, `📢 ${msg.user.displayName} يتحدث الآن`);
    });
    const offAudio = radio.on('audio', (msg: any) => {
      if (!isAndroid) return; // iOS يعتمد تشغيل التسجيل عند الوصول
      if (msg.channelId !== channelId || msg.user.id === me.id) return;
      player.write(msg.chunk);
    });
    const offTalkEnd = radio.on('talk_end', (msg: any) => {
      if (msg.channelId !== channelId) return;
      if (talkingRef.current && msg.user.id === talkingRef.current.id) {
        setTalkingUser(null);
        if (isAndroid) player.stop();
        radioService.update(name, 'متصل بالقناة');
      }
    });
    const offBusy = radio.on('busy', (msg: any) => {
      // ضغطت بينما شخص آخر يتحدث — أوقف الإرسال
      cleanupTransmit();
      setTalkingUser(msg.user);
      Alert.alert('القناة مشغولة', `${msg.user.displayName} يتحدث الآن`);
    });
    const offPresence = radio.on('presence', (msg: any) => {
      if (msg.channelId !== channelId) return;
      setOnline(msg.online);
      setMembers(prev =>
        prev.map(mem => ({...mem, online: msg.online.some((o: User) => o.id === mem.id)})),
      );
    });
    const offHistory = radio.on('history_new', (msg: any) => {
      if (msg.channelId !== channelId) return;
      setHistory(prev => [msg.message, ...prev]);
      // iOS: شغّل تسجيل الطرف الآخر تلقائياً فور وصوله (بديل البثّ اللحظي)
      if (!isAndroid && msg.message.userId !== me.id) playMessage(msg.message, true);
    });

    return () => {
      offTalkStart();
      offAudio();
      offTalkEnd();
      offBusy();
      offPresence();
      offHistory();
      cleanupTransmit();
      player.stop();
      radio.leave();
      radioService.stop();
      if (soundRef.current) {
        soundRef.current.release();
        soundRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const cleanupTransmit = () => {
    if (transmittingRef.current) {
      stopCapture();
    }
    transmittingRef.current = false;
    setTransmitting(false);
  };

  const startTalk = async () => {
    if (talkingRef.current) return; // شخص آخر يتحدث
    const ok = await ensureMicPermission();
    if (!ok) {
      Alert.alert('إذن مطلوب', 'فعّل إذن الميكروفون لاستخدام اللاسلكي');
      return;
    }
    setTransmitting(true);
    transmittingRef.current = true;
    player.beepStart();
    vibrate(40);
    radio.talkStart();
    radioService.update(name, '🎙️ جارٍ الإرسال…');
    startCapture(chunk => radio.sendAudio(chunk));
  };

  const endTalk = async () => {
    if (!transmittingRef.current) return;
    transmittingRef.current = false;
    setTransmitting(false);
    await stopCapture();
    radio.talkEnd();
    player.beepEnd();
    radioService.update(name, 'متصل بالقناة');
  };

  const playMessage = (item: Message, silent = false) => {
    if (soundRef.current) {
      soundRef.current.release();
      soundRef.current = null;
    }
    setPlayingId(item.id);
    const s = new Sound(audioUrl(item.file), undefined, (err: any) => {
      if (err) {
        setPlayingId(null);
        if (!silent) Alert.alert('خطأ', 'تعذّر تشغيل التسجيل');
        return;
      }
      soundRef.current = s;
      s.play(() => {
        s.release();
        soundRef.current = null;
        setPlayingId(null);
      });
    });
  };

  const onlineCount = online.length;

  const status = useMemo(() => {
    if (transmitting) return {text: 'جارٍ الإرسال…', color: colors.danger};
    if (talkingUser) return {text: `📢 ${talkingUser.displayName} يتحدث…`, color: colors.accent};
    return {text: 'القناة هادئة — اضغط للتحدث', color: colors.textDim};
  }, [transmitting, talkingUser]);

  const renderHistory = ({item}: {item: Message}) => {
    const mine = item.userId === me.id;
    return (
      <Pressable style={styles.msgRow} onPress={() => playMessage(item)}>
        <View style={[styles.playBtn, {backgroundColor: mine ? colors.primaryDark : colors.cardAlt}]}>
          {playingId === item.id ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.playIcon}>▶</Text>
          )}
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.msgUser}>{mine ? 'أنت' : item.username}</Text>
          <Text style={styles.msgMeta}>
            {(item.durationMs / 1000).toFixed(1)} ثانية · {formatTime(item.createdAt)}
          </Text>
        </View>
        <Text style={styles.waveform}>▮▮▮▮▮▮</Text>
      </Pressable>
    );
  };

  const renderMember = ({item}: {item: Member}) => (
    <View style={styles.memberRow}>
      <View style={[styles.dot, {backgroundColor: item.online ? colors.online : colors.offline}]} />
      <Text style={styles.memberName}>{item.displayName}</Text>
      <Text style={styles.memberStatus}>{item.online ? 'متصل' : 'غير متصل'}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>›</Text>
        </Pressable>
        <View style={{flex: 1, alignItems: 'center'}}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.subtitle}>{onlineCount} متصل الآن</Text>
        </View>
        <View style={{width: 24}} />
      </View>

      {/* منطقة الحالة + زر التحدث */}
      <View style={styles.talkArea}>
        <Text style={[styles.status, {color: status.color}]}>{status.text}</Text>
        <View style={styles.pttWrap}>
          {(transmitting || !!talkingUser) && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulseRing,
                {
                  borderColor: transmitting ? colors.danger : colors.accent,
                  transform: [
                    {scale: pulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.45]})},
                  ],
                  opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.55, 0]}),
                },
              ]}
            />
          )}
          <Pressable
            onPressIn={startTalk}
            onPressOut={endTalk}
            disabled={!!talkingUser && !transmitting}
            style={({pressed}) => [
              styles.pttOuter,
              transmitting && styles.pttTransmitting,
              !!talkingUser && !transmitting && styles.pttDisabled,
              pressed && {transform: [{scale: 0.97}]},
            ]}>
            <View style={[styles.pttInner, transmitting && {backgroundColor: colors.danger}]}>
              <Text style={styles.pttIcon}>🎙️</Text>
              <Text style={styles.pttText}>
                {transmitting ? 'تكلّم الآن' : talkingUser ? 'انتظر دورك' : 'اضغط مع الاستمرار'}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* تبويبات السجل / المتصلون */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}>
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>السجل</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'members' && styles.tabActive]}
          onPress={() => setTab('members')}>
          <Text style={[styles.tabText, tab === 'members' && styles.tabTextActive]}>
            المتصلون ({members.length})
          </Text>
        </Pressable>
      </View>

      {tab === 'history' ? (
        <FlatList
          data={history}
          keyExtractor={m => String(m.id)}
          renderItem={renderHistory}
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={<Text style={styles.empty}>لا توجد تسجيلات بعد</Text>}
        />
      ) : (
        <FlatList
          data={members}
          keyExtractor={m => String(m.id)}
          renderItem={renderMember}
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={<Text style={styles.empty}>لا يوجد أعضاء</Text>}
        />
      )}
    </SafeAreaView>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {color: colors.text, fontSize: 34, lineHeight: 34},
  title: {color: colors.text, fontSize: 18, fontWeight: '800'},
  subtitle: {color: colors.online, fontSize: 12, marginTop: 2},
  talkArea: {alignItems: 'center', paddingVertical: 22},
  status: {fontSize: 15, fontWeight: '700', marginBottom: 18, height: 22},
  pttWrap: {width: 240, height: 240, alignItems: 'center', justifyContent: 'center'},
  pulseRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
  },
  pttOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.primary,
  },
  pttTransmitting: {borderColor: colors.danger},
  pttDisabled: {borderColor: colors.offline, opacity: 0.5},
  pttInner: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pttIcon: {fontSize: 52},
  pttText: {color: '#fff', fontWeight: '800', fontSize: 15, marginTop: 6},
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 4,
  },
  tab: {flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.pill},
  tabActive: {backgroundColor: colors.primary},
  tabText: {color: colors.textDim, fontWeight: '700'},
  tabTextActive: {color: '#fff'},
  msgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  playIcon: {color: '#fff', fontSize: 16, marginRight: -2},
  msgUser: {color: colors.text, fontWeight: '700', fontSize: 15, textAlign: 'right'},
  msgMeta: {color: colors.textDim, fontSize: 12, marginTop: 2, textAlign: 'right'},
  waveform: {color: colors.primary, fontSize: 12, letterSpacing: -1},
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: {width: 10, height: 10, borderRadius: 5, marginLeft: 12},
  memberName: {color: colors.text, fontSize: 16, flex: 1, textAlign: 'right'},
  memberStatus: {color: colors.textDim, fontSize: 13},
  empty: {color: colors.textDim, textAlign: 'center', marginTop: 40},
});
