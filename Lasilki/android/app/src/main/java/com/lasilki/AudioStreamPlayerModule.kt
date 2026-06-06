package com.lasilki

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.ToneGenerator
import android.util.Base64
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

/**
 * وحدة أصلية لتشغيل دفعات صوت PCM16 (mono) الواردة لحظياً عبر AudioTrack في وضع البثّ.
 * هذا ما يمنح إحساس اللاسلكي المباشر: تسمع صوت الطرف الآخر أثناء تحدّثه وليس بعد انتهائه.
 */
class AudioStreamPlayerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var audioTrack: AudioTrack? = null
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var playing = false

    override fun getName() = "AudioStreamPlayer"

    /** بدء جلسة تشغيل بمعدل عيّنات محدّد (16000 افتراضياً ليطابق المُسجّل) */
    @ReactMethod
    fun start(sampleRate: Int) {
        executor.execute {
            stopInternal()
            try {
                val minBuf = AudioTrack.getMinBufferSize(
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
                )
                // مخزن صغير لتأخير منخفض (بثّ لحظي) مع هامش لتفادي التقطيع
                val bufferSize = if (minBuf > 0) minBuf * 2 else sampleRate
                // المُنشئ الكلاسيكي (STREAM_MUSIC) أوسع توافقاً عبر الأجهزة بما فيها هواوي
                @Suppress("DEPRECATION")
                val track = AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize,
                    AudioTrack.MODE_STREAM
                )
                track.play()
                audioTrack = track
                playing = true
            } catch (e: Exception) {
                playing = false
                audioTrack = null
            }
        }
    }

    /** كتابة دفعة PCM مُرمّزة بـ Base64 إلى مجرى التشغيل */
    @ReactMethod
    fun write(base64Chunk: String) {
        executor.execute {
            val track = audioTrack ?: return@execute
            if (!playing) return@execute
            try {
                val bytes = Base64.decode(base64Chunk, Base64.DEFAULT)
                track.write(bytes, 0, bytes.size)
            } catch (_: Exception) {
            }
        }
    }

    /** إنهاء جلسة التشغيل وتحرير الموارد */
    @ReactMethod
    fun stop() {
        executor.execute { stopInternal() }
    }

    private fun stopInternal() {
        playing = false
        try {
            audioTrack?.apply {
                pause()
                flush()
                stop()
                release()
            }
        } catch (_: Exception) {
        }
        audioTrack = null
    }

    /** نغمة قصيرة (بيب). kind=1 بداية الإرسال، غير ذلك نهاية الإرسال (Roger) */
    @ReactMethod
    fun beep(kind: Int, durationMs: Int) {
        Thread {
            try {
                val tone = if (kind == 1) ToneGenerator.TONE_PROP_BEEP else ToneGenerator.TONE_PROP_ACK
                val tg = ToneGenerator(AudioManager.STREAM_MUSIC, 80)
                tg.startTone(tone, durationMs)
                Thread.sleep((durationMs + 90).toLong())
                tg.release()
            } catch (_: Exception) {
            }
        }.start()
    }

    // مطلوبة لتوافق NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
