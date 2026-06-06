// استبعاد Firebase من بناء iOS (يبقى مفعّلاً على أندرويد)
// السبب: إشعارات iOS تحتاج إعداد Apple Push (APNs) معقّداً — نؤجّلها، ويبني iOS بدون GoogleService-Info.plist.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': {platforms: {ios: null}},
    '@react-native-firebase/messaging': {platforms: {ios: null}},
  },
};
