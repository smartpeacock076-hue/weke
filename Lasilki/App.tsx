import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, StatusBar, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {AuthContext} from './src/auth-context';
import {loadSession, verifyToken, User} from './src/api';
import {radio} from './src/ws';
import {initPush, bindNotificationOpen} from './src/push';
import {colors} from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ChannelScreen from './src/screens/ChannelScreen';
import SearchScreen from './src/screens/SearchScreen';
import RequestsScreen from './src/screens/RequestsScreen';
import CreateGroupScreen from './src/screens/CreateGroupScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {...DefaultTheme.colors, background: colors.bg, card: colors.bg, text: colors.text},
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    (async () => {
      await loadSession();
      const u = await verifyToken();
      if (u) {
        setUser(u);
        radio.connect();
      }
      setBooting(false);
    })();
  }, []);

  // الإشعارات: تسجيل الرمز + فتح القناة عند الضغط على إشعار
  useEffect(() => {
    if (!user) return;
    initPush();
    const unsub = bindNotificationOpen(t => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Channel' as never, {
          id: t.channelId,
          name: t.channelName,
        } as never);
      }
    });
    return unsub;
  }, [user, navigationRef]);

  const auth = useMemo(
    () => ({
      user,
      signIn: (u: User) => {
        setUser(u);
        radio.connect();
      },
      signOut: () => {
        radio.disconnect();
        setUser(null);
      },
    }),
    [user],
  );

  if (booting) {
    return (
      <View style={{flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center'}}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <AuthContext.Provider value={auth}>
        <NavigationContainer theme={navTheme} ref={navigationRef}>
          <Stack.Navigator screenOptions={{headerShown: false}}>
            {user ? (
              <>
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Channel" component={ChannelScreen} />
                <Stack.Screen name="Search" component={SearchScreen} />
                <Stack.Screen name="Requests" component={RequestsScreen} />
                <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
              </>
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
