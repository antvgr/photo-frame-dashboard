package com.wesbos.homehq;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.provider.Settings;
import android.content.ActivityNotFoundException;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Full-screen kiosk WebView for the Home Screen wall tablet.
 * - Immersive mode hides the status + navigation bars (true 1280x800).
 * - Exit: hold two fingers still on the screen for 1.5s to go to the regular launcher.
 * - Remote debugging is OFF unless launched with the debug extra (every app on this device
 *   gets root, so the devtools socket should only exist while actively debugging):
 *     adb shell am start -n com.wesbos.homehq/.MainActivity --ez debug true
 * - Launch with a URL: adb shell am start -a android.intent.action.VIEW -d <url> -n com.wesbos.homehq/.MainActivity
 */
public class MainActivity extends Activity implements SensorEventListener {
  static final String TAG = "HomeHQ";
  static final String DEFAULT_URL = "http://homeassistant.local:8123/local/cadre/index.html"; // hosted by Home Assistant (frame-setup/deploy-to-ha.ps1); fallback: the PC server http://127.0.0.1:4173/
  static final String LAUNCHER_PACKAGE = "amirz.rootless.nexuslauncher";
  static final long RETRY_MS = 5000;
  static final long EXIT_HOLD_MS = 1500;
  static final float EXIT_SLOP_PX = 60;

  private WebView web;
  private SensorManager sensors;
  private Sensor lightSensor;
  private volatile float lux = -1f;
  private String targetUrl = DEFAULT_URL;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final int[] exitIds = new int[2];
  private final float[] exitX = new float[2];
  private final float[] exitY = new float[2];
  private boolean exitArmed;

  private final Runnable exitToLauncher = new Runnable() {
    @Override
    public void run() {
      exitArmed = false;
      Log.i(TAG, "Two-finger hold: exiting to launcher");
      Intent launcher = getPackageManager().getLaunchIntentForPackage(LAUNCHER_PACKAGE);
      if (launcher != null) {
        launcher.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launcher);
      }
    }
  };

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    applyOrientation(getSharedPreferences("kiosk", MODE_PRIVATE).getString("orient", "landscape"));
    applyBrightness(getSharedPreferences("kiosk", MODE_PRIVATE).getFloat("bright", -1f));
    applyDebugFlag(getIntent());
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | WindowManager.LayoutParams.FLAG_FULLSCREEN);

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    web.setWebViewClient(new WebViewClient() { // keep navigation inside the kiosk
      @Override
      public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
        if (failingUrl != null && failingUrl.equals(targetUrl)) showWaiting();
      }
    });
    web.setWebChromeClient(new WebChromeClient() { // only the dashboard's own diagnostics reach the log
      @Override
      public boolean onConsoleMessage(ConsoleMessage m) {
        if (m.message().startsWith("DIAG")) Log.i(TAG, m.message());
        return true;
      }
    });
    web.addJavascriptInterface(new Bridge(), "HomeHQ"); // ambient light for the dashboard theme
    sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
    lightSensor = sensors.getDefaultSensor(Sensor.TYPE_LIGHT);
    setContentView(web);

    String url = getIntent().getDataString();
    targetUrl = url != null ? url : DEFAULT_URL;
    web.loadUrl(targetUrl);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    applyDebugFlag(intent);
    String url = intent.getDataString();
    if (url != null) { targetUrl = url; web.loadUrl(targetUrl); }
  }

  /** Shown while the dashboard server (the PC) is unreachable; retries every few seconds. */
  private void showWaiting() {
    web.loadDataWithBaseURL(null,
        "<html><body style='margin:0;background:#0E0E0F;color:#8E897F;font:28px sans-serif;display:flex;" +
        "align-items:center;justify-content:center;height:100vh'>Dashboard en attente de Home Assistant&hellip;</body></html>",
        "text/html", "utf-8", null);
    handler.removeCallbacks(retry);
    handler.postDelayed(retry, RETRY_MS);
  }

  private final Runnable retry = new Runnable() {
    @Override
    public void run() { web.loadUrl(targetUrl); }
  };

  /** Exposed to the page as window.HomeHQ: only the latest ambient light reading, in lux (-1 if unknown). */
  private class Bridge {
    @JavascriptInterface
    public float lux() { return lux; }

    /** Screen orientation chosen in the dashboard settings: "landscape", "portrait" or "auto" (follows the sensor). */
    @JavascriptInterface
    public void setOrientation(final String o) {
      getSharedPreferences("kiosk", MODE_PRIVATE).edit().putString("orient", o).apply();
      runOnUiThread(new Runnable() {
        @Override
        public void run() { applyOrientation(o); }
      });
    }

    /** Screen brightness 0..1 for this window (overrides the Android automatic brightness); a negative value gives control back to Android. */
    @JavascriptInterface
    public void setBrightness(final double v) {
      getSharedPreferences("kiosk", MODE_PRIVATE).edit().putFloat("bright", (float) v).apply();
      runOnUiThread(new Runnable() {
        @Override
        public void run() { applyBrightness((float) v); }
      });
    }

    /** Opens the Android Wi-Fi settings. Returns false when that screen is not available. */
    @JavascriptInterface
    public boolean openWifi() {
      try {
        Intent i = new Intent(Settings.ACTION_WIFI_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
        return true;
      } catch (ActivityNotFoundException e) {
        Log.w(TAG, "No Wi-Fi settings screen");
        return false;
      }
    }

    /** Leaves the kiosk for the regular Android launcher (same as the two-finger hold). */
    @JavascriptInterface
    public void exitToLauncher() {
      runOnUiThread(new Runnable() {
        @Override
        public void run() { exitToLauncher.run(); }
      });
    }

    @JavascriptInterface
    public String orientation() { return getSharedPreferences("kiosk", MODE_PRIVATE).getString("orient", "landscape"); }
  }

  private void applyBrightness(float v) {
    WindowManager.LayoutParams lp = getWindow().getAttributes();
    lp.screenBrightness = v < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.max(0.02f, Math.min(1f, v));
    getWindow().setAttributes(lp);
  }

  private void applyOrientation(String o) {
    if ("portrait".equals(o)) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
    else if ("auto".equals(o)) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
    else setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (sensors != null && lightSensor != null) sensors.registerListener(this, lightSensor, SensorManager.SENSOR_DELAY_NORMAL);
  }

  @Override
  protected void onPause() {
    super.onPause();
    if (sensors != null) sensors.unregisterListener(this);
  }

  @Override
  public void onSensorChanged(SensorEvent e) {
    if (e.sensor.getType() == Sensor.TYPE_LIGHT) lux = e.values[0];
  }

  @Override
  public void onAccuracyChanged(Sensor sensor, int accuracy) {}

  /** Remote debugging only when explicitly requested; any normal launch turns it back off. */
  private void applyDebugFlag(Intent intent) {
    boolean debug = intent != null && intent.getBooleanExtra("debug", false);
    WebView.setWebContentsDebuggingEnabled(debug);
    Log.i(TAG, "WebView remote debugging " + (debug ? "ON" : "off"));
  }

  /** Watches for the two-finger exit hold; all touches still go to the page. */
  @Override
  public boolean dispatchTouchEvent(MotionEvent e) {
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_POINTER_DOWN:
        if (e.getPointerCount() == 2) {
          for (int i = 0; i < 2; i++) {
            exitIds[i] = e.getPointerId(i);
            exitX[i] = e.getX(i);
            exitY[i] = e.getY(i);
          }
          exitArmed = true;
          handler.removeCallbacks(exitToLauncher);
          handler.postDelayed(exitToLauncher, EXIT_HOLD_MS);
        } else {
          cancelExit(); // 3+ fingers
        }
        break;
      case MotionEvent.ACTION_MOVE:
        if (exitArmed) {
          for (int i = 0; i < 2; i++) {
            int idx = e.findPointerIndex(exitIds[i]);
            if (idx < 0 || Math.hypot(e.getX(idx) - exitX[i], e.getY(idx) - exitY[i]) > EXIT_SLOP_PX) {
              cancelExit();
              break;
            }
          }
        }
        break;
      case MotionEvent.ACTION_POINTER_UP:
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        cancelExit();
        break;
      default:
        break;
    }
    return super.dispatchTouchEvent(e);
  }

  private void cancelExit() {
    if (!exitArmed) return;
    exitArmed = false;
    handler.removeCallbacks(exitToLauncher);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemUi();
  }

  private void hideSystemUi() {
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
  }
}
