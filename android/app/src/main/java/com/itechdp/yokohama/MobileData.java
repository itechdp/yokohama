package com.itechdp.yokohama;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;
import java.util.List;

/**
 * Reads the real SIM mobile data switch, per SIM, from the telephony stack. It never guesses:
 * when the state cannot be read the result is UNKNOWN, not ON. (Android lets no app change it,
 * see {@link Kiosk#openMobileData}.) Needs READ_PHONE_STATE, which the device owner grants itself.
 */
final class MobileData {

    enum Level { ON, OFF, NO_SIM, UNKNOWN }

    /** Result of one read: {@code bar} is the short text for the status strip, {@code menu} for the admin menu. */
    static final class State {
        final Level level;
        final String bar;
        final String menu;

        State(Level level, String bar, String menu) {
            this.level = level;
            this.bar = bar;
            this.menu = menu;
        }
    }

    private MobileData() {}

    static State read(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !hasPermission(context)) return unknown();
        try {
            SubscriptionManager sm = context.getSystemService(SubscriptionManager.class);
            TelephonyManager tm = context.getSystemService(TelephonyManager.class);
            if (sm == null || tm == null) return unknown();
            List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();
            if (subs == null || subs.isEmpty()) {
                return new State(Level.NO_SIM, "Mobile data: no SIM", "Mobile Data: no SIM");
            }

            int defaultId = SubscriptionManager.getDefaultDataSubscriptionId();
            SubscriptionInfo main = subs.get(0);
            StringBuilder perSim = new StringBuilder();
            for (SubscriptionInfo sub : subs) {
                if (sub.getSubscriptionId() == defaultId) main = sub;
                boolean on = tm.createForSubscriptionId(sub.getSubscriptionId()).isDataEnabled();
                if (perSim.length() > 0) perSim.append(", ");
                perSim.append("SIM ").append(sub.getSimSlotIndex() + 1).append(' ').append(on ? "ON" : "OFF");
            }
            boolean mainOn = tm.createForSubscriptionId(main.getSubscriptionId()).isDataEnabled();
            Level level = mainOn ? Level.ON : Level.OFF;
            String word = mainOn ? "ON" : "OFF";
            if (subs.size() == 1) {
                return new State(level, "Mobile data " + word, "Mobile Data: " + word);
            }
            String slot = "SIM " + (main.getSimSlotIndex() + 1);
            return new State(level, "Mobile data " + word + " (" + slot + ")", "Mobile Data: " + perSim + "  [data SIM: " + slot + "]");
        } catch (SecurityException | IllegalStateException e) {
            return unknown();
        }
    }

    private static State unknown() {
        return new State(Level.UNKNOWN, "Mobile data: ?", "Mobile Data: status unavailable");
    }

    private static boolean hasPermission(Context context) {
        String perm = Manifest.permission.READ_PHONE_STATE;
        if (context.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) return true;
        // Granting it ourselves only works as device owner; otherwise stay UNKNOWN.
        DevicePolicyManager dpm = context.getSystemService(DevicePolicyManager.class);
        if (dpm == null || !dpm.isDeviceOwnerApp(context.getPackageName())) return false;
        dpm.setPermissionGrantState(new ComponentName(context, AdminReceiver.class), context.getPackageName(), perm,
            DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
        return context.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }
}
