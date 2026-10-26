package com.itechdp.yokohama;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.UserManager;
import android.provider.Settings;

/**
 * Kiosk mode: once this app is the device owner (set once over ADB), the tablet is
 * pinned to this app only — no home screen, recents, status bar, or other apps.
 * Admins toggle it from the hidden menu in {@link KioskAdmin}. When the app is not
 * the device owner, everything here is a no-op.
 */
final class Kiosk {

    private static final String PREFS = "kiosk";
    private static final String KEY_ENABLED = "enabled";

    /** How long Settings stays reachable after "Change Wi-Fi" before the lock closes it. */
    private static final long WIFI_WINDOW_MS = 3 * 60 * 1000;

    private static final String[] RESTRICTIONS = {
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_ADD_USER,
    };

    private Kiosk() {}

    static boolean isDeviceOwner(Context context) {
        DevicePolicyManager dpm = context.getSystemService(DevicePolicyManager.class);
        return dpm != null && dpm.isDeviceOwnerApp(context.getPackageName());
    }

    static boolean isEnabled(Context context) {
        return isDeviceOwner(context) && prefs(context).getBoolean(KEY_ENABLED, true);
    }

    /** Called on every resume: re-applies the lock (and closes any open Wi-Fi window). */
    static void enforce(Activity activity) {
        if (!isEnabled(activity)) return;
        applyPolicies(activity);
        ActivityManager am = activity.getSystemService(ActivityManager.class);
        if (am != null && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
            activity.startLockTask();
        }
    }

    static void start(Activity activity) {
        prefs(activity).edit().putBoolean(KEY_ENABLED, true).apply();
        enforce(activity);
    }

    static void stop(Activity activity) {
        prefs(activity).edit().putBoolean(KEY_ENABLED, false).apply();
        activity.stopLockTask();
        clearPolicies(activity);
    }

    /** Opens the Wi-Fi panel inside kiosk mode by briefly allowing the Settings app. */
    static void openWifi(Activity activity) {
        Intent wifi = new Intent(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? Settings.Panel.ACTION_WIFI
            : Settings.ACTION_WIFI_SETTINGS);
        ResolveInfo target = activity.getPackageManager().resolveActivity(wifi, 0);
        if (target == null) return;

        if (isEnabled(activity)) {
            DevicePolicyManager dpm = activity.getSystemService(DevicePolicyManager.class);
            dpm.setLockTaskPackages(admin(activity),
                new String[] { activity.getPackageName(), target.activityInfo.packageName });

            // If the admin walks away with Settings open, lock it again anyway.
            Context app = activity.getApplicationContext();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (isEnabled(app)) dpm.setLockTaskPackages(admin(app), new String[] { app.getPackageName() });
            }, WIFI_WINDOW_MS);
        }
        activity.startActivity(wifi);
    }

    static void applyPolicies(Context context) {
        if (!isEnabled(context)) return;
        DevicePolicyManager dpm = context.getSystemService(DevicePolicyManager.class);
        ComponentName admin = admin(context);
        String pkg = context.getPackageName();

        dpm.setLockTaskPackages(admin, new String[] { pkg });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // Keep only the power menu so the tablet can still be restarted.
            dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS);
        }

        // Make this app the launcher, so it opens on boot and the Home button returns to it.
        setHomeAliasEnabled(context, true);
        IntentFilter homeFilter = new IntentFilter(Intent.ACTION_MAIN);
        homeFilter.addCategory(Intent.CATEGORY_HOME);
        homeFilter.addCategory(Intent.CATEGORY_DEFAULT);
        dpm.addPersistentPreferredActivity(admin, homeFilter, homeAlias(context));

        for (String restriction : RESTRICTIONS) dpm.addUserRestriction(admin, restriction);

        // Pre-grant the camera for the QR scanner so no permission dialog appears.
        dpm.setPermissionGrantState(admin, pkg, Manifest.permission.CAMERA,
            DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
        // Android only reveals the Wi-Fi network name to apps that hold location (status strip).
        dpm.setPermissionGrantState(admin, pkg, Manifest.permission.ACCESS_FINE_LOCATION,
            DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
    }

    /** Undoes the lock but stays device owner, so kiosk mode can be started again. */
    private static void clearPolicies(Context context) {
        if (!isDeviceOwner(context)) return;
        DevicePolicyManager dpm = context.getSystemService(DevicePolicyManager.class);
        ComponentName admin = admin(context);

        for (String restriction : RESTRICTIONS) dpm.clearUserRestriction(admin, restriction);
        dpm.clearPackagePersistentPreferredActivities(admin, context.getPackageName());
        setHomeAliasEnabled(context, false);
        // Removing ourselves from the allowlist also ends a running lock task.
        dpm.setLockTaskPackages(admin, new String[0]);
    }

    /** Removes kiosk mode for good and gives up device owner (ADB only, see KioskRemoveReceiver). */
    static void remove(Context context) {
        clearPolicies(context);
        if (isDeviceOwner(context)) {
            context.getSystemService(DevicePolicyManager.class).clearDeviceOwnerApp(context.getPackageName());
        }
        prefs(context).edit().clear().apply();
    }

    private static void setHomeAliasEnabled(Context context, boolean enabled) {
        context.getPackageManager().setComponentEnabledSetting(homeAlias(context),
            enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP);
    }

    private static ComponentName homeAlias(Context context) {
        return new ComponentName(context, context.getPackageName() + ".KioskHome");
    }

    private static ComponentName admin(Context context) {
        return new ComponentName(context, AdminReceiver.class);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
