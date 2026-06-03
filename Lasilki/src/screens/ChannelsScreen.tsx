import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, radius} from '../theme';
import {Channel, createChannel, listChannels, logout} from '../api';
import {useAuth} from '../auth-context';
import {radio} from '../ws';

export default function ChannelsScreen({navigation}: any) {
  const {user, signOut} = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listChannels();
      setChannels(list);
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
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

  const submitCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ch = await createChannel(newName.trim(), newDesc.trim());
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      navigation.navigate('Channel', {id: ch.id, name: ch.name});
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    } finally {
      setCreating(false);
    }
  };

  const renderItem = ({item}: {item: Channel}) => (
    <Pressable
      style={({pressed}) => [styles.channel, pressed && {opacity: 0.8}]}
      onPress={() => navigation.navigate('Channel', {id: item.id, name: item.name})}>
      <View style={styles.channelIcon}>
        <Text style={{fontSize: 22}}>📡</Text>
      </View>
      <View style={{flex: 1}}>
        <Text style={styles.channelName}>{item.name}</Text>
        {!!item.description && (
          <Text style={styles.channelDesc} numberOfLines={1}>
            {item.description}
          </Text>
        )}
        <View style={styles.metaRow}>
          <View style={[styles.dot, {backgroundColor: item.online > 0 ? colors.online : colors.offline}]} />
          <Text style={styles.meta}>
            {item.online} متصل الآن · {item.members} عضو
          </Text>
        </View>
      </View>
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>مرحباً</Text>
          <Text style={styles.userName}>{user?.displayName}</Text>
        </View>
        <Pressable onPress={doLogout} style={styles.logoutBtn} hitSlop={10}>
          <Text style={styles.logoutText}>خروج</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>القنوات</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={c => String(c.id)}
          renderItem={renderItem}
          contentContainerStyle={{padding: 16, paddingBottom: 100}}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>لا توجد قنوات بعد — أنشئ واحدة بالزر بالأسفل</Text>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>قناة جديدة</Text>
            <TextInput
              style={styles.input}
              placeholder="اسم القناة"
              placeholderTextColor={colors.textDim}
              value={newName}
              onChangeText={setNewName}
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              placeholder="الوصف (اختياري)"
              placeholderTextColor={colors.textDim}
              value={newDesc}
              onChangeText={setNewDesc}
              textAlign="right"
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setShowCreate(false)}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.createBtn]} onPress={submitCreate} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>إنشاء</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  hello: {color: colors.textDim, fontSize: 13},
  userName: {color: colors.text, fontSize: 20, fontWeight: '800'},
  logoutBtn: {
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {color: colors.text, fontWeight: '700'},
  sectionTitle: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 6,
    textAlign: 'right',
  },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  channelName: {color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'right'},
  channelDesc: {color: colors.textDim, fontSize: 13, marginTop: 2, textAlign: 'right'},
  metaRow: {flexDirection: 'row', alignItems: 'center', marginTop: 6, justifyContent: 'flex-end'},
  dot: {width: 8, height: 8, borderRadius: 4, marginLeft: 6},
  meta: {color: colors.textDim, fontSize: 12},
  chevron: {color: colors.textDim, fontSize: 28, marginRight: 4},
  empty: {color: colors.textDim, textAlign: 'center', marginTop: 50},
  fab: {
    position: 'absolute',
    bottom: 28,
    left: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabText: {color: '#fff', fontSize: 32, lineHeight: 36},
  modalBg: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end'},
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle: {color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 16, textAlign: 'right'},
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    fontSize: 16,
  },
  modalActions: {flexDirection: 'row', marginTop: 8, gap: 12},
  modalBtn: {flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center'},
  cancelBtn: {backgroundColor: colors.cardAlt},
  cancelText: {color: colors.text, fontWeight: '700'},
  createBtn: {backgroundColor: colors.primary},
  createText: {color: '#fff', fontWeight: '800'},
});
