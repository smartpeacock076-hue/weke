import React, {useState} from 'react';
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
import {acceptFriend, searchUsers, sendFriendRequest, SearchUser} from '../api';

export default function SearchScreen({navigation}: any) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      setResults(await searchUsers(q.trim()));
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = (id: number, status: SearchUser['status']) =>
    setResults(prev => prev.map(u => (u.id === id ? {...u, status} : u)));

  const add = async (u: SearchUser) => {
    try {
      const r: any = await sendFriendRequest(u.username);
      setStatus(u.id, r.status === 'friends' ? 'friends' : 'requested');
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    }
  };

  const accept = async (u: SearchUser) => {
    try {
      await acceptFriend(u.id);
      setStatus(u.id, 'friends');
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    }
  };

  const renderItem = ({item}: {item: SearchUser}) => (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={{color: '#fff', fontWeight: '800', fontSize: 18}}>
          {item.displayName?.[0] || '؟'}
        </Text>
      </View>
      <View style={{flex: 1}}>
        <Text style={styles.name}>{item.displayName}</Text>
        <Text style={styles.user}>@{item.username}</Text>
      </View>
      {item.status === 'none' && (
        <Pressable style={styles.addBtn} onPress={() => add(item)}>
          <Text style={styles.addTxt}>＋ إضافة</Text>
        </Pressable>
      )}
      {item.status === 'requested' && <Text style={styles.muted}>تم الإرسال</Text>}
      {item.status === 'incoming' && (
        <Pressable style={[styles.addBtn, {backgroundColor: colors.online}]} onPress={() => accept(item)}>
          <Text style={styles.addTxt}>قبول</Text>
        </Pressable>
      )}
      {item.status === 'friends' && <Text style={[styles.muted, {color: colors.online}]}>صديق ✓</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>›</Text>
        </Pressable>
        <Text style={styles.title}>إضافة صديق</Text>
        <View style={{width: 24}} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="اكتب اسم المستخدم…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          onSubmitEditing={doSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.searchBtn} onPress={doSearch}>
          <Text style={styles.searchBtnTxt}>بحث</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 30}} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={u => String(u.id)}
          renderItem={renderItem}
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={
            searched ? <Text style={styles.empty}>لا نتائج لهذا الاسم</Text> : <Text style={styles.empty}>ابحث باسم المستخدم لإضافة صديق</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border},
  back: {color: colors.text, fontSize: 34, lineHeight: 34},
  title: {flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '800'},
  searchRow: {flexDirection: 'row', padding: 16, gap: 10},
  input: {flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlign: 'right', fontSize: 16},
  searchBtn: {backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center'},
  searchBtnTxt: {color: '#fff', fontWeight: '800'},
  row: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border},
  avatar: {width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginLeft: 12},
  name: {color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right'},
  user: {color: colors.textDim, fontSize: 13, textAlign: 'right'},
  addBtn: {backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill},
  addTxt: {color: '#fff', fontWeight: '800'},
  muted: {color: colors.textDim, fontWeight: '700'},
  empty: {color: colors.textDim, textAlign: 'center', marginTop: 40},
});
