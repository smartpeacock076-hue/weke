// طبقة الصوت: التقاط الصوت (PCM) عبر react-native-audio-record + تشغيله مباشرة عبر الوحدة الأصلية
import {NativeModules, PermissionsAndroid, Platform, Vibration} from 'react-native';
import AudioRecord from 'react-native-audio-record';
import {AUDIO} from './config';

const {AudioStreamPlayer} = NativeModules;

let recorderInited = false;
let capturing = false;
let currentOnChunk: ((b64: string) => void) | null = null;

export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'إذن الميكروفون',
      message: 'يحتاج التطبيق إلى الميكروفون لإرسال صوتك عبر القناة',
      buttonPositive: 'موافق',
      buttonNegative: 'إلغاء',
    },
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function initRecorder() {
  if (recorderInited) return;
  AudioRecord.init({
    sampleRate: AUDIO.sampleRate,
    channels: AUDIO.channels,
    bitsPerSample: AUDIO.bitsPerSample,
    audioSource: AUDIO.audioSource,
    wavFile: 'lasilki_tmp.wav',
  });
  // مستمع واحد فقط يوجّه الدفعات إلى الدالة الحالية
  AudioRecord.on('data', (data: string) => {
    currentOnChunk?.(data);
  });
  recorderInited = true;
}

/** بدء الالتقاط — تُستدعى onChunk لكل دفعة صوت (base64 PCM16) */
export function startCapture(onChunk: (b64: string) => void) {
  initRecorder();
  currentOnChunk = onChunk;
  capturing = true;
  AudioRecord.start();
}

/** إيقاف الالتقاط */
export async function stopCapture() {
  currentOnChunk = null;
  if (!capturing) return;
  capturing = false;
  try {
    await AudioRecord.stop();
  } catch {}
}

/** مشغّل الصوت المباشر (الوحدة الأصلية AudioStreamPlayer) */
export const player = {
  start() {
    AudioStreamPlayer?.start(AUDIO.sampleRate);
  },
  write(b64: string) {
    AudioStreamPlayer?.write(b64);
  },
  stop() {
    AudioStreamPlayer?.stop();
  },
  beepStart() {
    AudioStreamPlayer?.beep(1, 140);
  },
  beepEnd() {
    AudioStreamPlayer?.beep(2, 170);
  },
};

export function vibrate(ms = 40) {
  try {
    Vibration.vibrate(ms);
  } catch {}
}

export const playerAvailable = !!AudioStreamPlayer;
