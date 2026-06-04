import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, radius} from '../theme';
import {createChannel, Friend, getFriends, inviteToChannel} from '../api';

export default function CreateGroupScreen({navigation}: any) {
  const [name, setName] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setFriends(await getFriends());
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const create = async () => {
    if (!name.trim()) {
      Alert.alert('تنبيه', 'اكتب اسم المجموعة');
      return;
    }
    setCreating(true);
    try {
      const ch = await createChannel(name.trim());
      const toInvite = friends.filter(f => selected.has(f.id));
      for (const f of toInvite) {
        try {
          await inviteToChannel(ch.id, f.username);
        } catch {}
      }
      navigation.replace('Channel', {id: ch.id, name: ch.name});
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
      setCreating(false);
    }
  };

  const renderFriend = ({item}: {item: Friend}) => {
    const on = selected.has(item.id);
    return (
      <Pressable style={styles.row} onPress={() => toggle(item.id)}>
        <View style={[styles.check, on && {backgroundColor: colors.primary, borderColor: colors.primary}]}>
          {on && <Text style={{color: '#fff', fontWeight: '900'}}>✓</Text>}
        </View>
        <Text style={styles.name}>{item.displayName}</Text>
        <Text style={styles.user}>@{item.username}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>›</Text>
        </Pressable>
        <Text style={styles.title}>مجموعة جديدة</Text>
        <View style={{width: 24}} />
      </View>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="اسم المجموعة"
        placeholderTextColor={colors.textDim}
        textAlign="right"
      />

      <Text style={styles.section}>ادعُ أصدقاءك ({selected.size})</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 20}} />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={f => String(f.id)}
          renderItem={renderFriend}
          contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 90}}
          ListEmptyComponent={<Text style={styles.empty}>لا أصدقاء بعد — يمكنك دعوتهم لاحقاً</Text>}
        />
      )}

      <Pressable style={styles.createBtn} onPress={create} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createTxt}>إنشاء المجموعة</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border},
  back: {color: colors.text, fontSize: 34, lineHeight: 34},
  title: {flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '800'},
  input: {backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, borderWidth: 1, borderColor: colors.border, margin: 16, fontSize: 16},
  section: {color: colors.textDim, fontSize: 13, fontWeight: '700', paddingHorizontal: 20, marginBottom: 6, textAlign: 'right'},
  row: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, gap: 12},
  check: {width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'},
  name: {color: colors.text, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'right'},
  user: {color: colors.textDim, fontSize: 13},
  empty: {color: colors.textDim, textAlign: 'center', marginTop: 30},
  createBtn: {position: 'absolute', bottom: 24, left: 24, right: 24, backgroundColor: colors.primary, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center'},
  createTxt: {color: '#fff', fontWeight: '800', fontSize: 16},
});
