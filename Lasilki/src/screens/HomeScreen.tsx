import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, radius} from '../theme';
import {
  Channel,
  Friend,
  getFriendRequests,
  getFriends,
  listChannels,
  logout,
  openDM,
} from '../api';
import {useAuth} from '../auth-context';
import {radio} from '../ws';

type Tab = 'chats' | 'friends';

export default function HomeScreen({navigation}: any) {
  const {user, signOut} = useAuth();
  const [tab, setTab] = useState<Tab>('chats');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [reqCount, setReqCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ch, fr, rq] = await Promise.all([
        listChannels(),
        getFriends(),
        getFriendRequests(),
      ]);
      setChannels(ch);
      setFriends(fr);
      setReqCount(rq.length);
    } catch (e: any) {
      // تجاهل بهدوء عند مشاكل الشبكة المؤقتة
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const doLogout = async () => {
    radio.disconnect();
    await logout();
    signOut();
  };

  const talkToFriend = async (f: Friend) => {
    if (opening) return;
    setOpening(true);
    try {
      const ch = await openDM(f.username);
      navigation.navigate('Channel', {id: ch.id, name: ch.name});
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    } finally {
      setOpening(false);
    }
  };

  const renderChannel = ({item}: {item: Channel}) => {
    const isGroup = item.type === 'group';
    return (
      <Pressable
        style={({pressed}) => [styles.row, pressed && {opacity: 0.8}]}
        onPress={() => navigation.navigate('Channel', {id: item.id, name: item.name})}>
        <View style={[styles.avatar, {backgroundColor: isGroup ? colors.cardAlt : colors.primaryDark}]}>
          <Text style={{fontSize: 22}}>{isGroup ? '👥' : '🗣️'}</Text>
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={styles.rowSub}>
            {isGroup ? `مجموعة · ${item.members} عضو` : 'محادثة فردية'}
            {item.online > 0 ? ` · ${item.online} متصل` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderFriend = ({item}: {item: Friend}) => (
    <Pressable
      style={({pressed}) => [styles.row, pressed && {opacity: 0.8}]}
      onPress={() => talkToFriend(item)}>
      <View style={[styles.avatar, {backgroundColor: colors.secondary}]}>
        <Text style={{fontSize: 20, color: '#fff', fontWeight: '800'}}>
          {item.displayName?.[0] || '؟'}
        </Text>
      </View>
      <View style={{flex: 1}}>
        <Text style={styles.rowTitle}>{item.displayName}</Text>
        <Text style={styles.rowSub}>@{item.username}</Text>
      </View>
      <Text style={styles.talkHint}>تحدّث 🎙️</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>مرحباً</Text>
          <Text style={styles.userName}>{user?.displayName}</Text>
        </View>
        <View style={styles.headerBtns}>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Requests')} hitSlop={8}>
            <Text style={styles.iconTxt}>🔔</Text>
            {reqCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{reqCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Search')} hitSlop={8}>
            <Text style={styles.iconTxt}>🔍</Text>
          </Pressable>
          <Pressable onPress={doLogout} style={styles.logoutBtn} hitSlop={8}>
            <Text style={styles.logoutText}>خروج</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'chats' && styles.tabActive]} onPress={() => setTab('chats')}>
          <Text style={[styles.tabText, tab === 'chats' && styles.tabTextActive]}>المحادثات</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'friends' && styles.tabActive]} onPress={() => setTab('friends')}>
          <Text style={[styles.tabText, tab === 'friends' && styles.tabTextActive]}>
            الأصدقاء ({friends.length})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
      ) : tab === 'chats' ? (
        <FlatList
          data={channels}
          keyExtractor={c => String(c.id)}
          renderItem={renderChannel}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); load();}} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>لا توجد محادثات بعد.{'\n'}أضف صديقاً 🔍 ثم تحدّث معه، أو أنشئ مجموعة ＋</Text>
          }
        />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={f => String(f.id)}
          renderItem={renderFriend}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); load();}} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>لا أصدقاء بعد.{'\n'}اضغط 🔍 وابحث باسم المستخدم لإضافة صديق</Text>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('CreateGroup')}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14},
  hello: {color: colors.textDim, fontSize: 13},
  userName: {color: colors.text, fontSize: 20, fontWeight: '800'},
  headerBtns: {flexDirection: 'row', alignItems: 'center', gap: 10},
  iconBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border},
  iconTxt: {fontSize: 18},
  badge: {position: 'absolute', top: -2, right: -2, backgroundColor: colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4},
  badgeTxt: {color: '#fff', fontSize: 11, fontWeight: '800'},
  logoutBtn: {backgroundColor: colors.cardAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border},
  logoutText: {color: colors.text, fontWeight: '700'},
  tabs: {flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, marginBottom: 6},
  tab: {flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.pill},
  tabActive: {backgroundColor: colors.primary},
  tabText: {color: colors.textDim, fontWeight: '700'},
  tabTextActive: {color: '#fff'},
  list: {padding: 16, paddingBottom: 100},
  row: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border},
  avatar: {width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 12},
  rowTitle: {color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right'},
  rowSub: {color: colors.textDim, fontSize: 13, marginTop: 2, textAlign: 'right'},
  talkHint: {color: colors.primary, fontWeight: '700', fontSize: 13},
  empty: {color: colors.textDim, textAlign: 'center', marginTop: 50, lineHeight: 24},
  fab: {position: 'absolute', bottom: 28, left: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6},
  fabText: {color: '#fff', fontSize: 32, lineHeight: 36},
});
