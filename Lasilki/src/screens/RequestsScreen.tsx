import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, radius} from '../theme';
import {acceptFriend, Friend, getFriendRequests, rejectFriend} from '../api';

export default function RequestsScreen({navigation}: any) {
  const [requests, setRequests] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRequests(await getFriendRequests());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = (id: number) => setRequests(prev => prev.filter(r => r.id !== id));

  const accept = async (f: Friend) => {
    try {
      await acceptFriend(f.id);
      remove(f.id);
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    }
  };

  const reject = async (f: Friend) => {
    try {
      await rejectFriend(f.id);
      remove(f.id);
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    }
  };

  const renderItem = ({item}: {item: Friend}) => (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={{color: '#fff', fontWeight: '800', fontSize: 18}}>{item.displayName?.[0] || '؟'}</Text>
      </View>
      <View style={{flex: 1}}>
        <Text style={styles.name}>{item.displayName}</Text>
        <Text style={styles.user}>@{item.username}</Text>
      </View>
      <Pressable style={[styles.btn, {backgroundColor: colors.online}]} onPress={() => accept(item)}>
        <Text style={styles.btnTxt}>قبول</Text>
      </Pressable>
      <Pressable style={[styles.btn, {backgroundColor: colors.cardAlt}]} onPress={() => reject(item)}>
        <Text style={[styles.btnTxt, {color: colors.text}]}>رفض</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>›</Text>
        </Pressable>
        <Text style={styles.title}>طلبات الصداقة</Text>
        <View style={{width: 24}} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{marginTop: 30}} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={r => String(r.id)}
          renderItem={renderItem}
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={<Text style={styles.empty}>لا توجد طلبات واردة</Text>}
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
  row: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, gap: 8},
  avatar: {width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginLeft: 8},
  name: {color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right'},
  user: {color: colors.textDim, fontSize: 13, textAlign: 'right'},
  btn: {paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill},
  btnTxt: {color: '#fff', fontWeight: '800'},
  empty: {color: colors.textDim, textAlign: 'center', marginTop: 40},
});
