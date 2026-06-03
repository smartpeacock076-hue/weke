// تحكّم JS بخدمة الخلفية والإشعار الدائم + إذن الإشعارات
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

const {RadioService} = NativeModules;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || (Platform.Version as number) < 33) return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export const radioService = {
  start(title: string, text: string) {
    RadioService?.start(title, text);
  },
  update(title: string, text: string) {
    RadioService?.update(title, text);
  },
  stop() {
    RadioService?.stop();
  },
};

export const serviceAvailable = !!RadioService;
