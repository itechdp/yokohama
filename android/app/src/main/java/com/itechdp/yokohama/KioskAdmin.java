package com.itechdp.yokohama;

import android.app.Activity;
import android.os.SystemClock;
import android.text.InputType;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;

/**
 * Hidden admin menu: tap the top-left corner of the screen 7 times within 3 seconds,
 * then enter the PIN. It is native (not part of the website), so it still works when
 * the tablet has no Wi-Fi and the app cannot load.
 */
final class KioskAdmin {

    /** Change this to set the admin PIN. */
    private static final String ADMIN_PIN = "3007";

    private static final int SECRET_TAPS = 7;
    private static final long SECRET_WINDOW_MS = 3000;
    private static final int CORNER_DP = 120;

    private final Activity activity;
    /** Times of the most recent corner taps (ring buffer of SECRET_TAPS entries). */
    private final long[] tapTimes = new long[SECRET_TAPS];
    private int tapCount;
    private AlertDialog pinDialog;

    KioskAdmin(Activity activity) {
        this.activity = activity;
    }

    /**
     * Watches touches without consuming them, so the app underneath still works normally.
     * Opens the PIN screen when 7 corner taps fall inside any 3-second span: the window slides, so
     * one slow tap does not restart the count. Taps elsewhere are ignored (not counted, not
     * resetting).
     */
    void onTouch(MotionEvent event) {
        if (event.getActionMasked() != MotionEvent.ACTION_DOWN) return;

        float corner = CORNER_DP * activity.getResources().getDisplayMetrics().density;
        if (event.getX() > corner || event.getY() > corner) return;

        long now = SystemClock.uptimeMillis();
        tapTimes[tapCount % SECRET_TAPS] = now;
        tapCount++;
        if (tapCount < SECRET_TAPS) return;

        // The oldest of the last 7 taps is the one the next write would overwrite.
        long oldest = tapTimes[tapCount % SECRET_TAPS];
        if (now - oldest <= SECRET_WINDOW_MS) {
            tapCount = 0;
            showPinDialog();
        }
    }

    private void showPinDialog() {
        if (pinDialog != null && pinDialog.isShowing()) return;
        EditText pin = new EditText(activity);
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setHint("PIN");
        FrameLayout box = new FrameLayout(activity);
        int pad = (int) (24 * activity.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(pin);

        AlertDialog dialog = pinDialog = new AlertDialog.Builder(activity)
            .setTitle("Admin")
            .setView(box)
            .setPositiveButton("OK", (d, w) -> {
                activity.getSystemService(InputMethodManager.class).hideSoftInputFromWindow(pin.getWindowToken(), 0);
                if (ADMIN_PIN.equals(pin.getText().toString())) {
                    showMenu();
                } else {
                    Toast.makeText(activity, "Wrong PIN", Toast.LENGTH_SHORT).show();
                }
            })
            .setNegativeButton("Cancel", null)
            .create();
        dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        dialog.show();
        pin.requestFocus();
    }

    private void showMenu() {
        if (!Kiosk.isDeviceOwner(activity)) {
            new AlertDialog.Builder(activity)
                .setTitle("Admin")
                .setMessage("Kiosk mode is not set up on this tablet.")
                .setPositiveButton("OK", null)
                .show();
            return;
        }

        boolean locked = Kiosk.isEnabled(activity);
        String[] items = {
            "Change Wi-Fi",
            MobileData.read(activity).menu,
            locked ? "Exit kiosk mode" : "Start kiosk mode",
        };

        new AlertDialog.Builder(activity)
            .setTitle(locked ? "Kiosk mode is ON" : "Kiosk mode is OFF")
            .setItems(items, (d, which) -> {
                if (which == 0) {
                    Kiosk.openWifi(activity);
                } else if (which == 1) {
                    if (!Kiosk.openMobileData(activity)) {
                        Toast.makeText(activity, "Mobile data settings not available", Toast.LENGTH_SHORT).show();
                    }
                } else if (locked) {
                    Kiosk.stop(activity);
                    Toast.makeText(activity, "Kiosk mode OFF", Toast.LENGTH_SHORT).show();
                } else {
                    Kiosk.start(activity);
                    Toast.makeText(activity, "Kiosk mode ON", Toast.LENGTH_SHORT).show();
                }
            })
            .setNegativeButton("Close", null)
            .show();
    }
}
