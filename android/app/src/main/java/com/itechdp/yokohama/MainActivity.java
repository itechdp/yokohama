package com.itechdp.yokohama;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskLockPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        PluginHandle handle = getBridge().getPlugin("KioskLock");
        if (handle != null && handle.getInstance() instanceof KioskLockPlugin) {
            ((KioskLockPlugin) handle.getInstance()).onWindowFocusChanged(hasFocus);
        }
    }
}
