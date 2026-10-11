package expo.modules.bluetoothvoiceroute

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class BluetoothVoiceRouteModule : Module(), TextToSpeech.OnInitListener {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var scoReceiver: BroadcastReceiver? = null
  private var scoTimeout: Runnable? = null
  private var scoPromise: Promise? = null
  private var focusListener: AudioManager.OnAudioFocusChangeListener? = null
  private var focusRequest: AudioFocusRequest? = null
  private var focusHeld = false
  private var tts: TextToSpeech? = null
  private var ttsEpoch = 0
  private val ttsReady = AtomicBoolean(false)
  private val waitingForEngine = mutableListOf<SpeakRequest>()
  private val utterancePromises = LinkedHashMap<String, Promise>()
  private val speakTimeouts = LinkedHashMap<String, Runnable>()

  override fun definition() = ModuleDefinition {
    Name("BluetoothVoiceRoute")

    AsyncFunction("prepare") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(mapOf("bluetooth" to false, "input" to "microphone", "focus" to false))
        return@AsyncFunction
      }
      mainHandler.post { prepareOnMain(context, promise) }
    }

    AsyncFunction("speakInVoiceChannel") { text: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || text.isBlank()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      mainHandler.post { speakInVoiceChannel(context, text, promise) }
    }

    Function("release") {
      val context = appContext.reactContext ?: return@Function null
      mainHandler.post { releaseOnMain(context) }
      null
    }

    Function("requestAudioFocus") {
      val context = appContext.reactContext ?: return@Function mapOf("granted" to false)
      val granted = requestFocusOnMain(audioManager(context))
      mapOf("granted" to granted)
    }

    Function("abandonAudioFocus") {
      val context = appContext.reactContext ?: return@Function null
      val am = audioManager(context)
      if (Looper.myLooper() == Looper.getMainLooper()) {
        abandonFocus(am)
      } else {
        mainHandler.post { abandonFocus(am) }
      }
      null
    }

    Function("playStartCue") {
      playTone(android.media.ToneGenerator.TONE_PROP_BEEP, 100)
      null
    }

    Function("playFailureCue") {
      playTone(android.media.ToneGenerator.TONE_PROP_NACK, 180)
      null
    }

    OnDestroy {
      val context = appContext.reactContext
      mainHandler.post {
        if (context != null) releaseOnMain(context)
        shutdownTts()
      }
    }
  }

  private class SpeakRequest(val text: String, val promise: Promise)

  override fun onInit(status: Int) {
    val engine = tts
    if (status != TextToSpeech.SUCCESS || engine == null) {
      Log.w("Voice", "[TTS] init failed: $status")
      try { engine?.shutdown() } catch (_: Exception) {}
      if (tts === engine) tts = null
      ttsReady.set(false)
      val queued = waitingForEngine.toList()
      waitingForEngine.clear()
      queued.forEach { it.promise.reject("TTS_INIT", "TextToSpeech init failed", null) }
      return
    }
    ttsReady.set(true)
    applyCallAttributes(engine)
    val language = engine.setLanguage(Locale.KOREA)
    Log.i("Voice", "[TTS] init language=$language")
    engine.setOnUtteranceProgressListener(progressListener)
    val queued = waitingForEngine.toList()
    waitingForEngine.clear()
    queued.forEach { startSpeak(engine, it) }
  }

  private val progressListener = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String?) {}

    override fun onDone(utteranceId: String?) {
      mainHandler.post { settleUtterance(utteranceId) }
    }

    @Deprecated("Deprecated in Java")
    override fun onError(utteranceId: String?) {
      mainHandler.post { failUtterance(utteranceId, "TextToSpeech error") }
    }

    override fun onError(utteranceId: String?, errorCode: Int) {
      mainHandler.post { failUtterance(utteranceId, "TextToSpeech error $errorCode") }
    }

    override fun onStop(utteranceId: String?, interrupted: Boolean) {
      mainHandler.post { settleUtterance(utteranceId) }
    }
  }

  private fun playTone(toneType: Int, durationMs: Int) {
    try {
      val tone = android.media.ToneGenerator(AudioManager.STREAM_MUSIC, 90)
      tone.startTone(toneType, durationMs)
      mainHandler.postDelayed({
        try { tone.release() } catch (_: Exception) {}
      }, (durationMs + 80).toLong())
    } catch (_: Exception) {
    }
  }

  private fun requestFocusOnMain(am: AudioManager): Boolean {
    if (Looper.myLooper() == Looper.getMainLooper()) return requestFocus(am)
    val result = AtomicBoolean(false)
    val latch = CountDownLatch(1)
    mainHandler.post {
      result.set(requestFocus(am))
      latch.countDown()
    }
    try {
      latch.await(700, TimeUnit.MILLISECONDS)
    } catch (_: InterruptedException) {
    }
    return result.get()
  }

  /**
   * 통화 스트림으로 짧은 독점 포커스를 먼저 받고, 거절되면 같은 스트림의 일반 일시 포커스로 다시 요청한다.
   * Android 12+ 는 AudioFocusRequest 에 VOICE_COMMUNICATION 과 STREAM_VOICE_CALL 을 같이 넣는다.
   */
  private fun requestFocus(am: AudioManager): Boolean {
    if (focusHeld) return true
    val listener = focusListener ?: AudioManager.OnAudioFocusChangeListener { change ->
      if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
        focusHeld = false
      }
    }.also { focusListener = it }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val attributes = callAttributes()
      val gains = intArrayOf(
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
      )
      for (gain in gains) {
        val request = AudioFocusRequest.Builder(gain)
          .setAudioAttributes(attributes)
          .setAcceptsDelayedFocusGain(false)
          .setWillPauseWhenDucked(false)
          .setOnAudioFocusChangeListener(listener, mainHandler)
          .build()
        focusRequest = request
        if (am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
          focusHeld = true
          return true
        }
      }
    }

    val legacyGains = intArrayOf(
      AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE,
      AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
    )
    for (gain in legacyGains) {
      @Suppress("DEPRECATION")
      val code = am.requestAudioFocus(listener, AudioManager.STREAM_VOICE_CALL, gain)
      if (code == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        focusHeld = true
        return true
      }
    }
    focusHeld = false
    return false
  }

  private fun abandonFocus(am: AudioManager) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        focusRequest?.let { am.abandonAudioFocusRequest(it) }
      } else {
        focusListener?.let {
          @Suppress("DEPRECATION")
          am.abandonAudioFocus(it)
        }
      }
    } catch (_: Exception) {
    }
    focusRequest = null
    focusHeld = false
  }

  private fun audioManager(context: Context): AudioManager {
    return context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  }

  private fun callAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .apply {
        @Suppress("DEPRECATION")
        setLegacyStreamType(AudioManager.STREAM_VOICE_CALL)
      }
      .build()
  }

  private fun applyCallAttributes(engine: TextToSpeech) {
    try {
      engine.setAudioAttributes(callAttributes())
      engine.setSpeechRate(1.0f)
    } catch (_: Exception) {
    }
  }

  private fun ensureTts(context: Context) {
    if (tts != null) return
    ttsEpoch += 1
    val epoch = ttsEpoch
    ttsReady.set(false)
    tts = TextToSpeech(context.applicationContext, TextToSpeech.OnInitListener { status ->
      if (epoch != ttsEpoch) return@OnInitListener
      onInit(status)
    })
  }

  private fun shutdownTts() {
    ttsEpoch += 1
    ttsReady.set(false)
    waitingForEngine.clear()
    try { tts?.shutdown() } catch (_: Exception) {}
    tts = null
  }

  /**
   * 복명복창 직전에만 통화 모드와 SCO 를 연다.
   * SCO_AUDIO_STATE_CONNECTED 또는 1.5초 타임아웃까지 기다린 뒤 결과를 돌려준다.
   */
  private fun prepareOnMain(context: Context, promise: Promise) {
    val am = audioManager(context)
    ensureTts(context)
    val focusOk = requestFocus(am)
    Log.i("Voice", "[Voice] Audio focus: $focusOk")
    cancelScoWait(context)
    try {
      am.mode = AudioManager.MODE_IN_COMMUNICATION
    } catch (_: Exception) {
    }
    preferBluetoothCommunicationDevice(am)
    val alreadyConnected = try {
      am.isBluetoothScoOn
    } catch (_: Exception) {
      false
    }
    if (alreadyConnected) {
      Log.i("Voice", "[Voice] Bluetooth SCO Connected: true")
      promise.resolve(routeStatus(true))
      return
    }

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (intent?.action != AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED) return
        val state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
        when (state) {
          AudioManager.SCO_AUDIO_STATE_CONNECTED -> finishScoWait(context, promise, true)
          AudioManager.SCO_AUDIO_STATE_ERROR -> finishScoWait(context, promise, false)
        }
      }
    }
    scoPromise = promise
    scoReceiver = receiver
    try {
      val filter = IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
      val sticky = if (Build.VERSION.SDK_INT >= 33) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
      val stickyState = sticky?.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
      if (stickyState == AudioManager.SCO_AUDIO_STATE_CONNECTED) {
        finishScoWait(context, promise, true)
        return
      }
    } catch (e: Exception) {
      Log.w("Voice", "[Voice] SCO receiver", e)
      finishScoWait(context, promise, false)
      return
    }

    val timeout = Runnable {
      val connected = try {
        am.isBluetoothScoOn
      } catch (_: Exception) {
        false
      }
      finishScoWait(context, promise, connected)
    }
    scoTimeout = timeout
    mainHandler.postDelayed(timeout, 1500)
    try {
      @Suppress("DEPRECATION", "MissingPermission")
      am.startBluetoothSco()
    } catch (e: Exception) {
      Log.w("Voice", "[Voice] startBluetoothSco", e)
      finishScoWait(context, promise, false)
    }
  }

  private fun preferBluetoothCommunicationDevice(am: AudioManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    try {
      val device: AudioDeviceInfo = am.availableCommunicationDevices.firstOrNull { info: AudioDeviceInfo ->
        info.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || info.type == AudioDeviceInfo.TYPE_BLE_HEADSET
      } ?: return
      val ok = am.setCommunicationDevice(device)
      Log.i("Voice", "[Voice] Communication device: ${device.productName} ($ok)")
    } catch (e: Exception) {
      Log.w("Voice", "[Voice] Communication device skip", e)
    }
  }

  private fun routeStatus(connected: Boolean): Map<String, Any> {
    return mapOf(
      "bluetooth" to connected,
      "input" to if (connected) "bluetooth" else "microphone",
      "focus" to focusHeld,
    )
  }

  private fun finishScoWait(context: Context, promise: Promise, connected: Boolean) {
    if (scoPromise !== promise) return
    scoPromise = null
    unregisterScoReceiver(context)
    if (connected) {
      try {
        @Suppress("DEPRECATION")
        audioManager(context).isBluetoothScoOn = true
      } catch (_: Exception) {
      }
    }
    Log.i("Voice", "[Voice] Bluetooth SCO Connected: $connected")
    promise.resolve(routeStatus(connected))
  }

  private fun unregisterScoReceiver(context: Context) {
    scoTimeout?.let { mainHandler.removeCallbacks(it) }
    scoTimeout = null
    scoReceiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: Exception) {
      }
    }
    scoReceiver = null
  }

  private fun cancelScoWait(context: Context) {
    val pending = scoPromise
    scoPromise = null
    unregisterScoReceiver(context)
    pending?.resolve(routeStatus(false))
  }

  private fun speakInVoiceChannel(context: Context, text: String, promise: Promise) {
    ensureTts(context)
    val engine = tts
    if (engine != null && ttsReady.get()) {
      startSpeak(engine, SpeakRequest(text, promise))
      return
    }
    waitingForEngine.add(SpeakRequest(text, promise))
  }

  private fun startSpeak(engine: TextToSpeech, request: SpeakRequest) {
    applyCallAttributes(engine)
    val id = "tvolley-${System.nanoTime()}"
    utterancePromises[id] = request.promise
    val params = Bundle()
    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id)
    params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL)
    val code = try {
      engine.speak(request.text, TextToSpeech.QUEUE_FLUSH, params, id)
    } catch (e: Exception) {
      Log.w("Voice", "[TTS] speak", e)
      TextToSpeech.ERROR
    }
    if (code == TextToSpeech.ERROR) {
      utterancePromises.remove(id)
      request.promise.reject("TTS_ERROR", "TextToSpeech.speak failed", null)
      return
    }
    Log.i("Voice", "[TTS] voice call: ${request.text}")
    val timeout = Runnable {
      if (!utterancePromises.containsKey(id)) return@Runnable
      try { engine.stop() } catch (_: Exception) {}
      settleUtterance(id)
    }
    speakTimeouts[id] = timeout
    mainHandler.postDelayed(timeout, 12000)
  }

  private fun settleUtterance(id: String?) {
    if (id == null) return
    speakTimeouts.remove(id)?.let { mainHandler.removeCallbacks(it) }
    val promise = utterancePromises.remove(id) ?: return
    promise.resolve(null)
  }

  private fun failUtterance(id: String?, message: String) {
    if (id == null) return
    speakTimeouts.remove(id)?.let { mainHandler.removeCallbacks(it) }
    val promise = utterancePromises.remove(id) ?: return
    promise.reject("TTS_ERROR", message, null)
  }

  private fun settleAllUtterances() {
    val ids = utterancePromises.keys.toList()
    ids.forEach { settleUtterance(it) }
    val queued = waitingForEngine.toList()
    waitingForEngine.clear()
    queued.forEach { it.promise.resolve(null) }
  }

  /** SCO 를 닫고 일반 모드로 되돌린 뒤, 포커스와 재생 중인 TTS 를 정리한다. */
  private fun releaseOnMain(context: Context) {
    cancelScoWait(context)
    try { tts?.stop() } catch (_: Exception) {}
    settleAllUtterances()
    val am = audioManager(context)
    try {
      @Suppress("DEPRECATION", "MissingPermission")
      am.stopBluetoothSco()
      @Suppress("DEPRECATION")
      am.isBluetoothScoOn = false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        am.clearCommunicationDevice()
      }
      am.mode = AudioManager.MODE_NORMAL
    } catch (_: Exception) {
    }
    abandonFocus(am)
  }
}
