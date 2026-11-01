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
import java.util.Collections;
import java.util.List;

/**
 * Reads the real SIM mobile data switch, per SIM, from the telephony stack. It never guesses:
 * when the state cannot be read the result is UNKNOWN, not ON. (Android lets no app change it,
 * see {@link Kiosk#openMobileData}.) Needs READ_PHONE_STATE, which the device owner grants itself.
 *
 * <p>"No SIM" is decided by the modem ({@link TelephonyManager#getSimState}), never by an empty
 * subscription list. Right after the mobile data switch is turned off, some OEMs (seen on vivo)
 * briefly publish no active subscription and an invalid default data subscription id. Treating
 * that gap as "no SIM" hid the SIM from the admin menu and blocked the settings screen needed to
 * turn data back on, so the switch could not be flipped again without a reboot.
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

            // A SIM is only "missing" when the modem says so in every slot. The subscription list below
            // can legitimately be empty while a card is present, so it must not be used to detect absence.
            if (simAbsent(tm)) {
                return new State(Level.NO_SIM, "Mobile data: no SIM", "Mobile Data: no SIM");
            }

            List<SubscriptionInfo> subs = activeSubscriptions(sm);
            if (subs.isEmpty()) {
                // Card present but the stack has not published a subscription yet; say "unknown" and let
                // the operator open the settings, rather than claiming there is no SIM.
                return unknown();
            }

            int defaultId = defaultDataSubscriptionId();
            SubscriptionInfo main = subs.get(0);
            StringBuilder perSim = new StringBuilder();
            for (SubscriptionInfo sub : subs) {
                if (sub.getSubscriptionId() == defaultId) main = sub;
                boolean on = isDataEnabled(tm, sub.getSubscriptionId());
                if (perSim.length() > 0) perSim.append(", ");
                perSim.append("SIM ").append(sub.getSimSlotIndex() + 1).append(' ').append(on ? "ON" : "OFF");
            }
            boolean mainOn = isDataEnabled(tm, main.getSubscriptionId());
            Level level = mainOn ? Level.ON : Level.OFF;
            String word = mainOn ? "ON" : "OFF";
            if (subs.size() == 1) {
                return new State(level, "Mobile data " + word, "Mobile Data: " + word);
            }
            String slot = "SIM " + (main.getSimSlotIndex() + 1);
            return new State(level, "Mobile data " + word + " (" + slot + ")", "Mobile Data: " + perSim + "  [data SIM: " + slot + "]");
        } catch (SecurityException | IllegalStateException | UnsupportedOperationException e) {
            return unknown();
        }
    }

    /**
     * The active SIM(s) the caller can see. Some OEMs momentarily publish an empty (and before
     * Android 15 a null) list while data switches off, so hidden subscriptions are used as a fallback
     * before giving up.
     */
    private static List<SubscriptionInfo> activeSubscriptions(SubscriptionManager sm) {
        List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();
        if ((subs == null || subs.isEmpty()) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            List<SubscriptionInfo> complete = sm.getCompleteActiveSubscriptionInfoList();
            if (complete != null && !complete.isEmpty()) return complete;
        }
        return subs == null ? Collections.emptyList() : subs;
    }

    /** The chosen data SIM, falling back to the active data SIM when the default reads as invalid. */
    private static int defaultDataSubscriptionId() {
        int id = SubscriptionManager.getDefaultDataSubscriptionId();
        if (id != SubscriptionManager.INVALID_SUBSCRIPTION_ID) return id;
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
            ? SubscriptionManager.getActiveDataSubscriptionId()
            : id;
    }

    private static boolean isDataEnabled(TelephonyManager tm, int subId) {
        return tm.createForSubscriptionId(subId).isDataEnabled();
    }

    /**
     * True only when the modem reports the card absent in every slot. Any other state, including
     * UNKNOWN while the radio is busy, counts as a card being present, so a transient gap in the
     * telephony stack can never be mistaken for "no SIM".
     */
    private static boolean simAbsent(TelephonyManager tm) {
        int slots = Math.max(tm.getPhoneCount(), 1);
        for (int i = 0; i < slots; i++) {
            if (tm.getSimState(i) != TelephonyManager.SIM_STATE_ABSENT) return false;
        }
        return true;
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
