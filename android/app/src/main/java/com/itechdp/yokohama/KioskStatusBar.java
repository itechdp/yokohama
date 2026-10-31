package com.itechdp.yokohama;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.database.ContentObserver;
import android.os.BatteryManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * Slim native strip at the top of the app showing Wi-Fi signal, battery level and charging
 * state. The status bar is hidden in kiosk mode, so this is the only place operators can see
 * them. Native on purpose: it keeps working when the website could not load.
 */
final class KioskStatusBar {

    private static final int HEIGHT_DP = 26;
    private static final int LEVELS = 5;

    private final Activity activity;
    private TextView wifiView;
    private TextView detailView;
    private TextView mobileView;
    private TextView batteryView;
    private SignalBars bars;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refresh();
        }
    };

    private final ContentObserver dataObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
        @Override
        public void onChange(boolean selfChange) {
            refreshMobile();
        }
    };

    KioskStatusBar(Activity activity) {
        this.activity = activity;
    }

    /** Adds the strip above the web content and pushes the content down by its height. */
    void attach() {
        float density = activity.getResources().getDisplayMetrics().density;
        int height = (int) (HEIGHT_DP * density);

        ViewGroup content = activity.findViewById(android.R.id.content);
        View web = content.getChildAt(0);
        FrameLayout.LayoutParams webParams = (FrameLayout.LayoutParams) web.getLayoutParams();
        webParams.topMargin = height;
        web.setLayoutParams(webParams);

        LinearLayout strip = new LinearLayout(activity);
        strip.setOrientation(LinearLayout.HORIZONTAL);
        strip.setBackgroundColor(Color.parseColor("#1F2937"));
        strip.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        strip.setPadding((int) (12 * density), 0, (int) (12 * density), 0);

        TextView label = new TextView(activity);
        label.setTextColor(Color.WHITE);
        label.setTextSize(12);
        label.setSingleLine(true);
        label.setText("Wi-Fi");
        strip.addView(label);

        bars = new SignalBars(activity);
        LinearLayout.LayoutParams barsParams = new LinearLayout.LayoutParams((int) (18 * density), (int) (14 * density));
        barsParams.setMargins((int) (6 * density), 0, (int) (6 * density), 0);
        strip.addView(bars, barsParams);

        // The network name gives way (ellipsis) so the battery text is never cut off.
        wifiView = new TextView(activity);
        wifiView.setTextColor(Color.WHITE);
        wifiView.setTextSize(12);
        wifiView.setSingleLine(true);
        wifiView.setEllipsize(TextUtils.TruncateAt.END);
        strip.addView(wifiView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        detailView = new TextView(activity);
        detailView.setTextColor(Color.WHITE);
        detailView.setTextSize(12);
        detailView.setSingleLine(true);
        detailView.setPadding((int) (4 * density), 0, 0, 0);
        strip.addView(detailView);

        mobileView = new TextView(activity);
        mobileView.setTextSize(12);
        mobileView.setSingleLine(true);
        mobileView.setTypeface(null, android.graphics.Typeface.BOLD);
        mobileView.setPadding((int) (8 * density), 0, 0, 0);
        strip.addView(mobileView);

        batteryView = new TextView(activity);
        batteryView.setTextColor(Color.WHITE);
        batteryView.setTextSize(12);
        batteryView.setSingleLine(true);
        batteryView.setPadding((int) (8 * density), 0, 0, 0);
        strip.addView(batteryView);
        content.addView(strip, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height, Gravity.TOP));

        // Android 15+ draws apps edge to edge, under the system status bar. Capacitor already
        // pushes the web view down by that inset, so only the strip must move below it.
        ViewCompat.setOnApplyWindowInsetsListener(strip, (v, insets) -> {
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) v.getLayoutParams();
            int top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            if (params.topMargin != top) {
                params.topMargin = top;
                v.setLayoutParams(params);
            }
            return insets;
        });
        ViewCompat.requestApplyInsets(strip);
    }

    void start() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_BATTERY_CHANGED);
        filter.addAction(WifiManager.RSSI_CHANGED_ACTION);
        filter.addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION);
        filter.addAction(WifiManager.WIFI_STATE_CHANGED_ACTION);
        activity.registerReceiver(receiver, filter);
        // The mobile data switch has no broadcast; its settings rows change instead (one per SIM).
        activity.getContentResolver().registerContentObserver(Settings.Global.CONTENT_URI, true, dataObserver);
        refresh();
    }

    void stop() {
        try {
            activity.unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {
            // Not registered.
        }
        activity.getContentResolver().unregisterContentObserver(dataObserver);
    }

    private void refresh() {
        if (wifiView == null) return;
        detailView.setText("");
        wifiView.setText(wifiText());
        batteryView.setText(batteryText());
        refreshMobile();
    }

    private void refreshMobile() {
        if (mobileView == null) return;
        MobileData.State state = MobileData.read(activity);
        mobileView.setText(state.bar);
        mobileView.setTextColor(Color.parseColor(state.level == MobileData.Level.ON ? "#34D399"
            : state.level == MobileData.Level.OFF ? "#F87171" : "#FBBF24"));
    }

    /** Sets the bars and signal figure, and returns the network name (or state) to show after them. */
    private String wifiText() {
        bars.setLevel(-1);
        WifiManager wifi = activity.getApplicationContext().getSystemService(WifiManager.class);
        ConnectivityManager cm = activity.getSystemService(ConnectivityManager.class);
        NetworkCapabilities caps = cm == null ? null : cm.getNetworkCapabilities(cm.getActiveNetwork());
        boolean onWifi = caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);

        if (wifi == null || !wifi.isWifiEnabled()) return "off";
        WifiInfo info = wifi.getConnectionInfo();
        if (!onWifi || info == null || info.getNetworkId() == -1) return "not connected";

        bars.setLevel(WifiManager.calculateSignalLevel(info.getRssi(), LEVELS));
        String ssid = info.getSSID() == null ? "" : info.getSSID().replace("\"", "");
        if (ssid.isEmpty() || ssid.equals(WifiManager.UNKNOWN_SSID)) ssid = "Wi-Fi";
        boolean online = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        // The name may be shortened with an ellipsis; the signal figure stays whole.
        detailView.setText(info.getRssi() + " dBm" + (online ? "" : " – no internet"));
        return ssid;
    }

    private String batteryText() {
        Intent battery = activity.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null) return "";
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
        int percent = level < 0 ? 0 : Math.round(level * 100f / scale);
        String state = status == BatteryManager.BATTERY_STATUS_FULL ? "full" : charging ? "charging" : "not charging";
        return "Battery " + percent + "% " + state;
    }

    /** Five rising bars; those up to the current level are lit. Drawn, because font glyphs vary per tablet. */
    private static final class SignalBars extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int level = -1;

        SignalBars(Context context) {
            super(context);
        }

        void setLevel(int level) {
            if (this.level == level) return;
            this.level = level;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float gap = getWidth() * 0.06f;
            float barWidth = (getWidth() - gap * (LEVELS - 1)) / LEVELS;
            for (int i = 0; i < LEVELS; i++) {
                paint.setColor(i <= level ? Color.WHITE : Color.parseColor("#4B5563"));
                float left = i * (barWidth + gap);
                float top = getHeight() * (1f - (i + 1f) / LEVELS);
                canvas.drawRect(left, top, left + barWidth, getHeight(), paint);
            }
        }
    }
}
