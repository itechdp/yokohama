package com.itechdp.yokohama;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Removes kiosk mode completely (gives up device owner) so the app can be uninstalled.
 * Protected by the DUMP permission in the manifest, so only `adb shell` can send it.
 */
public class KioskRemoveReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        Kiosk.remove(context);
    }
}
