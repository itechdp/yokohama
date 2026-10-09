package com.itechdp.yokohama;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

// All version-dependent kiosk-mode logic lives here, and only here. Nothing
// outside this class should branch on Build.VERSION for kiosk purposes.
//
// minSdk for this app is 24 (Capacitor 8's own platform floor), so there is
// no API-<24 branch - every device this app runs on supports both the
// legacy systemUiVisibility flags (API 24-29) and self-pinning Lock Task
// Mode (API 21+, so always available here).
public final class KioskHelper {

    private static final String TAG = "KioskHelper";

    private KioskHelper() {}

    // Turn kiosk mode on: fullscreen + keep-screen-on + attempt screen pinning.
    public static void enable(Activity activity) {
        if (activity == null) return;
        applyFullscreen(activity);
        setKeepScreenOn(activity, true);
        tryStartLockTask(activity);
    }

    // Turn kiosk mode off: unpin + drop keep-screen-on + restore system bars.
    public static void disable(Activity activity) {
        if (activity == null) return;
        tryStopLockTask(activity);
        setKeepScreenOn(activity, false);
        clearFullscreen(activity);
    }

    // Call from Activity#onWindowFocusChanged while kiosk mode is the
    // desired state. Immersive flags get silently cleared by the OS
    // whenever focus is regained (e.g. after a system dialog or the
    // keyboard) - this reapplies them. Also re-attempts screen pinning:
    // the manual "hold Back + Recents" unpin gesture (the one escape hatch
    // self-pinning can't block - see KioskHelper's class doc) typically
    // triggers a focus blip of its own, and the operator coming back to
    // this app after actually leaving always does - either way, this is
    // the single place kiosk mode gets re-asserted after an escape.
    public static void onWindowFocusChanged(Activity activity, boolean hasFocus) {
        if (activity == null || !hasFocus) return;
        applyFullscreen(activity);
        tryStartLockTask(activity);
    }

    // ---- fullscreen / immersive --------------------------------------

    private static void applyFullscreen(Activity activity) {
        try {
            Window window = activity.getWindow();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // API 30+: WindowInsetsControllerCompat.
                WindowCompat.setDecorFitsSystemWindows(window, false);
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.hide(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                // API 24-29: legacy systemUiVisibility flags.
                int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
                window.getDecorView().setSystemUiVisibility(flags);
            }
        } catch (Exception e) {
            // Never let a fullscreen toggle crash the app.
            Log.w(TAG, "applyFullscreen failed", e);
        }
    }

    private static void clearFullscreen(Activity activity) {
        try {
            Window window = activity.getWindow();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowCompat.setDecorFitsSystemWindows(window, true);
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.show(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
                }
            } else {
                window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        } catch (Exception e) {
            Log.w(TAG, "clearFullscreen failed", e);
        }
    }

    // ---- keep screen on -------------------------------------------------

    private static void setKeepScreenOn(Activity activity, boolean keepOn) {
        try {
            if (keepOn) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        } catch (Exception e) {
            Log.w(TAG, "setKeepScreenOn failed", e);
        }
    }

    // ---- lock task mode (self-pinning, no device-owner needed) ----------

    private static void tryStartLockTask(Activity activity) {
        try {
            if (isInLockTaskMode(activity)) return; // already pinned, don't double-call
            activity.startLockTask();
        } catch (Exception e) {
            // Blocked by device policy, OEM restriction, etc. - app must
            // keep working with fullscreen-only; never crash.
            Log.w(TAG, "startLockTask failed; continuing without screen pinning", e);
        }
    }

    private static void tryStopLockTask(Activity activity) {
        try {
            if (!isInLockTaskMode(activity)) return; // not pinned, nothing to stop
            activity.stopLockTask();
        } catch (Exception e) {
            Log.w(TAG, "stopLockTask failed", e);
        }
    }

    private static boolean isInLockTaskMode(Activity activity) {
        try {
            ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return false;
            return am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        } catch (Exception e) {
            Log.w(TAG, "isInLockTaskMode check failed", e);
            return false;
        }
    }
}
