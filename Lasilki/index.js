/**
 * @format
 */

import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import {name as appName} from './app.json';

// معالج رسائل الخلفية لـ FCM — مطلوب تسجيله خارج المكوّن.
// رسائل الإشعار تُعرض تلقائياً من النظام عند الإغلاق/الخلفية؛ هنا لا نحتاج عملاً إضافياً.
try {
  messaging().setBackgroundMessageHandler(async () => {});
} catch {}

AppRegistry.registerComponent(appName, () => App);
