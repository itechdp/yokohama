package com.itechdp.yokohama;

import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.view.MotionEvent;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private final KioskAdmin kioskAdmin = new KioskAdmin(this);
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile boolean loadFailed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Kiosk.applyPolicies(this);
        reloadWhenBackOnline();
    }

    @Override
    public void onResume() {
        super.onResume();
        Kiosk.enforce(this);
    }

    @Override
    public void onDestroy() {
        if (networkCallback != null) {
            getSystemService(ConnectivityManager.class).unregisterNetworkCallback(networkCallback);
        }
        super.onDestroy();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        kioskAdmin.onTouch(event);
        return super.dispatchTouchEvent(event);
    }

    /**
     * The app is served from the web, so with no Wi-Fi the WebView shows an error page.
     * Once a network connects, reload — but only if the app itself never loaded, so a
     * brief Wi-Fi drop never throws away someone's work.
     */
    private void reloadWhenBackOnline() {
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onReceivedError(WebView webView) {
                loadFailed = true;
            }
        });

        networkCallback = new ConnectivityManager.NetworkCallback() {
            // Wait for VALIDATED (real internet), not just "Wi-Fi connected", or the reload fails too.
            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                if (!loadFailed || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return;
                runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(
                    "!!document.getElementById('root')",
                    appLoaded -> {
                        loadFailed = false;
                        if (!"true".equals(appLoaded)) getBridge().reload();
                    }));
            }
        };
        getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(networkCallback);
    }
}
