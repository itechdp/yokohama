package com.itechdp.yokohama;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Installing an update kills the app and drops the lock, so reopen it straight away. */
public class KioskRelaunchReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Kiosk.isEnabled(context)) return;
        context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
}
