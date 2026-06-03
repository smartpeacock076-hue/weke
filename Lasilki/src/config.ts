// إعدادات التطبيق

// عنوان السيرفر الافتراضي عند أول تشغيل (يمكن تغييره من شاشة الدخول):
//  • محاكي أندرويد:   http://10.0.2.2:4000   (10.0.2.2 = localhost الخاص بالكمبيوتر)
//  • جهاز حقيقي:      http://192.168.1.X:4000 (عنوان IP لجهاز الكمبيوتر على شبكة الواي فاي)
//  • نشر سحابي:       https://your-app.up.railway.app
export const DEFAULT_SERVER = 'http://10.0.2.2:4000';

// إعدادات الصوت — يجب أن تطابق إعدادات السيرفر (wav.js)
export const AUDIO = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 6, // VOICE_RECOGNITION — مناسب للكلام ويقلّل الضوضاء
};
