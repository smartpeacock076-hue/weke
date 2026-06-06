// إشعارات FCM — على أندرويد فقط (مستبعدة من بناء iOS).
// تحميل كسول (require) داخل حارس المنصّة لتفادي تحميل Firebase على iOS (كان يسبب كراش).
import {PermissionsAndroid, Platform} from 'react-native';
import {getServerUrl, getToken} from './api';

function getMessaging(): any {
  try {
    return require('@react-native-firebase/messaging').default;
  } catch {
    return null;
  }
}

async function sendTokenToServer(fcmToken: string) {
  try {
    await fetch(getServerUrl() + '/api/register-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + getToken(),
      },
      body: JSON.stringify({token: fcmToken}),
    });
  } catch {}
}

export async function initPush() {
  if (Platform.OS !== 'android') return; // FCM على أندرويد فقط حالياً
  const messaging = getMessaging();
  if (!messaging) return;
  try {
    if ((Platform.Version as number) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    await messaging().requestPermission();
    const fcmToken = await messaging().getToken();
    if (fcmToken) await sendTokenToServer(fcmToken);
    messaging().onTokenRefresh((t: string) => sendTokenToServer(t));
  } catch {}
}

export type PushTarget = {channelId: number; channelName: string};

function targetFromMessage(remoteMessage: any): PushTarget | null {
  const cid = remoteMessage?.data?.channelId;
  if (!cid) return null;
  return {channelId: Number(cid), channelName: remoteMessage?.data?.channelName || ''};
}

export function bindNotificationOpen(onOpen: (t: PushTarget) => void) {
  let unsub = () => {};
  if (Platform.OS !== 'android') return unsub;
  const messaging = getMessaging();
  if (!messaging) return unsub;
  try {
    unsub = messaging().onNotificationOpenedApp((rm: any) => {
      const t = targetFromMessage(rm);
      if (t) onOpen(t);
    });
    messaging()
      .getInitialNotification()
      .then((rm: any) => {
        const t = targetFromMessage(rm);
        if (t) onOpen(t);
      })
      .catch(() => {});
  } catch {}
  return unsub;
}
