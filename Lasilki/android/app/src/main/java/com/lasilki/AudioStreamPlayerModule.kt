package com.lasilki

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
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
            val minBuf = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            // مخزن مؤقت ~0.5 ثانية لتفادي التقطيع مع إبقاء التأخير منخفضاً
            val bufferSize = maxOf(minBuf, sampleRate)
            val track = AudioTrack(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
                bufferSize,
                AudioTrack.MODE_STREAM,
                AudioManager.AUDIO_SESSION_ID_GENERATE
            )
            track.play()
            audioTrack = track
            playing = true
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

    // مطلوبة لتوافق NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
