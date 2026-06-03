// إشعارات FCM: تسجيل رمز الجهاز + معالجة الضغط على الإشعار لفتح القناة
import {PermissionsAndroid, Platform} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import {getServerUrl, getToken} from './api';

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

/** تهيئة الإشعارات بعد تسجيل الدخول: طلب الإذن + إرسال الرمز للسيرفر */
export async function initPush() {
  try {
    if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    await messaging().requestPermission();
    const fcmToken = await messaging().getToken();
    if (fcmToken) await sendTokenToServer(fcmToken);
    messaging().onTokenRefresh(t => sendTokenToServer(t));
  } catch {
    // FCM غير مهيأ على هذا البناء — تجاهل بهدوء
  }
}

export type PushTarget = {channelId: number; channelName: string};

function targetFromMessage(remoteMessage: any): PushTarget | null {
  const cid = remoteMessage?.data?.channelId;
  if (!cid) return null;
  return {channelId: Number(cid), channelName: remoteMessage?.data?.channelName || ''};
}

/**
 * يربط أحداث فتح الإشعار. يستدعي onOpen عند:
 *  - الضغط على الإشعار والتطبيق في الخلفية
 *  - فتح التطبيق من إشعار بعد إغلاقه تماماً
 */
export function bindNotificationOpen(onOpen: (t: PushTarget) => void) {
  let unsub = () => {};
  try {
    unsub = messaging().onNotificationOpenedApp(remoteMessage => {
      const t = targetFromMessage(remoteMessage);
      if (t) onOpen(t);
    });
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        const t = targetFromMessage(remoteMessage);
        if (t) onOpen(t);
      })
      .catch(() => {});
  } catch {}
  return unsub;
}
