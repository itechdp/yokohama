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
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

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

    /**
     * Packages that host the Wi-Fi password dialog on newer Android (mainline Wi-Fi module).
     * Allowed together with Settings during the Wi-Fi window, or tapping a secured network
     * silently does nothing. Not-installed packages are harmless.
     */
    private static final String[] WIFI_DIALOG_PACKAGES = {
        "com.google.android.wifi.dialog",
        "com.android.wifi.dialog",
        "com.android.wifi.dialogex",
    };

    private static final String[] RESTRICTIONS = {
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_ADD_USER,
    };

    private static final Handler WIFI_WINDOW_HANDLER = new Handler(Looper.getMainLooper());
    private static Runnable relockAfterWifi = () -> {};

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

    /**
     * Opens Wi-Fi inside kiosk mode by briefly allowing the Settings app. Android 10-13 get the
     * small Wi-Fi panel. From Android 14 (tested: Android 16, vivo) tapping a secured network in
     * the panel does nothing under the lock, so the full Wi-Fi settings screen is used instead.
     */
    static void openWifi(Activity activity) {
        Intent wifi = new Intent(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? Settings.Panel.ACTION_WIFI
            : Settings.ACTION_WIFI_SETTINGS);
        openSettingsWindow(activity, wifi);
    }

    /**
     * Android gives no app (not even a device owner) a way to flip mobile data itself, so this opens
     * the system's own mobile data screen inside the same temporary Settings window as Wi-Fi.
     * Android 10-13 get the small internet panel (has the Mobile data switch); newer versions get
     * the full Network & internet screen. Returns false when the tablet has no such screen.
     */
    static boolean openMobileData(Activity activity) {
        Intent data = new Intent(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? Settings.Panel.ACTION_INTERNET_CONNECTIVITY
            : Settings.ACTION_DATA_ROAMING_SETTINGS);
        if (activity.getPackageManager().resolveActivity(data, 0) == null) {
            data = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
        }
        return openSettingsWindow(activity, data);
    }

    private static boolean openSettingsWindow(Activity activity, Intent wifi) {
        ResolveInfo target = activity.getPackageManager().resolveActivity(wifi, 0);
        if (target == null) return false;

        if (isEnabled(activity)) {
            DevicePolicyManager dpm = activity.getSystemService(DevicePolicyManager.class);
            dpm.setLockTaskPackages(admin(activity), wifiWindowPackages(activity, target.activityInfo.packageName));

            // If the admin walks away with Settings open, lock it again anyway. Only the newest
            // timer may run, or an older one would close this window while a password is typed.
            Context app = activity.getApplicationContext();
            WIFI_WINDOW_HANDLER.removeCallbacks(relockAfterWifi);
            relockAfterWifi = () -> {
                if (isEnabled(app)) dpm.setLockTaskPackages(admin(app), new String[] { app.getPackageName() });
            };
            WIFI_WINDOW_HANDLER.postDelayed(relockAfterWifi, WIFI_WINDOW_MS);
        }
        activity.startActivity(wifi);
        return true;
    }

    /** This app, Settings, the Wi-Fi dialog host(s) and the keyboard, for typing the password. */
    private static String[] wifiWindowPackages(Context context, String settingsPackage) {
        Set<String> packages = new LinkedHashSet<>();
        packages.add(context.getPackageName());
        packages.add(settingsPackage);
        packages.addAll(Arrays.asList(WIFI_DIALOG_PACKAGES));
        String ime = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        ComponentName imeComponent = ime == null ? null : ComponentName.unflattenFromString(ime);
        if (imeComponent != null) packages.add(imeComponent.getPackageName());
        return packages.toArray(new String[0]);
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
        // Needed to read the real SIM mobile data state (MobileData).
        dpm.setPermissionGrantState(admin, pkg, Manifest.permission.READ_PHONE_STATE,
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
