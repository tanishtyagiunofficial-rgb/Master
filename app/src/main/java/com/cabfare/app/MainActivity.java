package com.cabfare.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Thin shell around the app UI, which lives in assets/ as plain HTML/CSS/JS.
 * Trips and settings are stored in the WebView's localStorage on the device.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = "file:///android_asset/index.html";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1B2D);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) {
                    return false;
                }
                // Anything that is not the bundled app opens outside the app.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No app can handle the link; nothing to do.
                }
                return true;
            }
        });

        web.loadUrl(APP_URL);
    }

    /** Lets the UI close its own sheets / go back to the Fare tab before the app exits. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
                "(window.cabfareBack && window.cabfareBack()) ? 'handled' : 'exit'",
                value -> {
                    if (value == null || !value.contains("handled")) {
                        finish();
                    }
                });
    }

    /** The phone switched between light and dark: let the Auto theme follow. */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        web.evaluateJavascript("window.cabfareTheme && window.cabfareTheme()", null);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }

    private final class Bridge {
        /** True when the phone is set to its dark theme; the UI's Auto theme follows it. */
        @JavascriptInterface
        public boolean systemDark() {
            int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            return mode == Configuration.UI_MODE_NIGHT_YES;
        }

        /** A light tap of feedback, e.g. when a fare is saved. Needs no permission. */
        @JavascriptInterface
        public void haptic() {
            runOnUiThread(() -> web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY));
        }

        /** Opens the Android share sheet with plain text (used for trip export). */
        @JavascriptInterface
        public void share(String subject, String text) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, subject);
            send.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, subject)));
        }
    }
}
