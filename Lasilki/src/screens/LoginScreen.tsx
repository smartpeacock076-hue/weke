import React, {useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {colors, radius} from '../theme';
import {getServerUrl, login, register, setServerUrl} from '../api';
import {useAuth} from '../auth-context';

export default function LoginScreen() {
  const {signIn} = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getServerUrl());
  const [showServer, setShowServer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) {
      setError('أدخل اسم المستخدم وكلمة المرور');
      return;
    }
    setLoading(true);
    try {
      await setServerUrl(server);
      const user =
        mode === 'login'
          ? await login(username.trim(), password)
          : await register(username.trim(), password, displayName.trim() || username.trim());
      signIn(user);
    } catch (e: any) {
      setError(e.message || 'تعذّر الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{flex: 1, backgroundColor: colors.bg}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onLongPress={() => setShowServer(s => !s)} delayLongPress={700}>
          <Text style={styles.logo}>📻</Text>
        </Pressable>
        <Text style={styles.title}>لاسلكي</Text>
        <Text style={styles.subtitle}>تكلّم مباشرة كأنك تحمل جهاز لاسلكي</Text>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => setMode('login')}>
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>دخول</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'register' && styles.tabActive]}
              onPress={() => setMode('register')}>
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                حساب جديد
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>اسم المستخدم</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="مثال: ahmad"
            placeholderTextColor={colors.textDim}
          />

          {mode === 'register' && (
            <>
              <Text style={styles.label}>الاسم الظاهر</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="مثال: أحمد"
                placeholderTextColor={colors.textDim}
              />
            </>
          )}

          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.textDim}
          />

          {showServer && (
            <>
              <Text style={styles.label}>عنوان السيرفر (متقدّم)</Text>
              <TextInput
                style={styles.input}
                value={server}
                onChangeText={setServer}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://..."
                placeholderTextColor={colors.textDim}
              />
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({pressed}) => [styles.button, pressed && {opacity: 0.85}]}
            onPress={submit}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}</Text>
            )}
          </Pressable>
        </View>

        {showServer && (
          <Text style={styles.hint}>وضع متقدّم — اضغط الشعار مطوّلاً للإخفاء</Text>
        )}

        <Text style={styles.version}>الإصدار 2.3 — أصدقاء</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flexGrow: 1, justifyContent: 'center', padding: 24},
  logo: {fontSize: 64, textAlign: 'center'},
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {color: colors.textDim, textAlign: 'center', marginTop: 6, marginBottom: 22},
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 18,
  },
  tab: {flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center'},
  tabActive: {backgroundColor: colors.primary},
  tabText: {color: colors.textDim, fontWeight: '700'},
  tabTextActive: {color: '#fff'},
  label: {color: colors.textDim, marginBottom: 6, marginTop: 12, textAlign: 'right'},
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'right',
    fontSize: 16,
  },
  error: {color: colors.danger, marginTop: 12, textAlign: 'center'},
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {color: '#fff', fontWeight: '800', fontSize: 16},
  hint: {color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 18},
  version: {color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 16, opacity: 0.7},
});
