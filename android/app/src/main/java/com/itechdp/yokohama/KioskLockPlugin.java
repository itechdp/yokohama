package com.itechdp.yokohama;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Thin JS bridge over KioskHelper. All actual kiosk-mode logic (fullscreen,
// screen pinning, keep-screen-on, version branching) lives in KioskHelper;
// this plugin only forwards enable/disable calls to the current Activity,
// and tracks whether kiosk mode is currently wanted so MainActivity's
// onWindowFocusChanged override knows whether to reapply it.
@CapacitorPlugin(name = "KioskLock")
public class KioskLockPlugin extends Plugin {

    private boolean enabled = false;

    @PluginMethod
    public void enable(PluginCall call) {
        enabled = true;
        KioskHelper.enable(getActivity());
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        enabled = false;
        KioskHelper.disable(getActivity());
        call.resolve();
    }

    void onWindowFocusChanged(boolean hasFocus) {
        if (enabled) {
            KioskHelper.onWindowFocusChanged(getActivity(), hasFocus);
        }
    }
}
