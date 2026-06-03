package com.lasilki

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** تحكّم من JS بخدمة الخلفية والإشعار الدائم */
class RadioServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RadioService"

    @ReactMethod
    fun start(title: String, text: String) {
        val intent = Intent(reactContext, RadioForegroundService::class.java).apply {
            putExtra(RadioForegroundService.EXTRA_TITLE, title)
            putExtra(RadioForegroundService.EXTRA_TEXT, text)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    /** تحديث نص الإشعار (مثلاً: "أحمد يتحدث الآن") */
    @ReactMethod
    fun update(title: String, text: String) {
        start(title, text)
    }

    @ReactMethod
    fun stop() {
        reactContext.stopService(Intent(reactContext, RadioForegroundService::class.java))
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
