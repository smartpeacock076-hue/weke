package com.lasilki

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.i18nmanager.I18nUtil

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // فرض الاتجاه من اليمين لليسار (التطبيق عربي) قبل تحميل الواجهة
    val i18n = I18nUtil.getInstance()
    i18n.allowRTL(applicationContext, true)
    i18n.forceRTL(applicationContext, true)
    super.onCreate(savedInstanceState)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Lasilki"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
