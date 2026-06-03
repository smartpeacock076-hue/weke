/**
 * @format
 */

import {AppRegistry, I18nManager} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import {name as appName} from './app.json';

// فرض الاتجاه من اليمين لليسار (التطبيق عربي)
try {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
} catch {}

// معالج رسائل الخلفية لـ FCM — مطلوب تسجيله خارج المكوّن.
// رسائل الإشعار تُعرض تلقائياً من النظام عند الإغلاق/الخلفية؛ هنا لا نحتاج عملاً إضافياً.
try {
  messaging().setBackgroundMessageHandler(async () => {});
} catch {}

AppRegistry.registerComponent(appName, () => App);
