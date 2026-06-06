/**
 * @format
 */

import {AppRegistry, I18nManager, Platform} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// فرض الاتجاه من اليمين لليسار (التطبيق عربي)
try {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
} catch {}

// معالج رسائل الخلفية لـ FCM — على أندرويد فقط (Firebase مستبعدة من iOS).
if (Platform.OS === 'android') {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async () => {});
  } catch {}
}

AppRegistry.registerComponent(appName, () => App);
