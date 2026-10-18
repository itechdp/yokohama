package com.itechdp.yokohama;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

/** Device admin component. Becomes device owner via `adb shell dpm set-device-owner`. */
public class AdminReceiver extends DeviceAdminReceiver {

    @Override
    public void onEnabled(Context context, Intent intent) {
        Kiosk.applyPolicies(context);
    }
}
