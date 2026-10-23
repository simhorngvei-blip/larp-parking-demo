package com.larp.parking;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** Debug-only transport to the existing user app; not an offline/native rewrite. */
public class MainActivity extends Activity {
    private static final String HOME="http://127.0.0.1:8080"+BuildConfig.APP_PATH;
    private WebView web;
    private LinearLayout offline;
    private boolean failed;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(246,247,243));
        root.setOnApplyWindowInsetsListener((view,insets)->{
            android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
        });
        setContentView(root);root.requestApplyInsets();
        offline=new LinearLayout(this);offline.setOrientation(LinearLayout.VERTICAL);offline.setPadding(32,48,32,32);
        TextView text=new TextView(this);text.setText("Parking service is unavailable. Reconnect the demo server, then retry.");text.setTextSize(20);offline.addView(text);
        Button retry=new Button(this);retry.setText("Retry connection");retry.setOnClickListener(v->web.loadUrl(HOME));offline.addView(retry);offline.setVisibility(View.GONE);root.addView(offline);
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                String destination=request.getUrl().toString();
                if(!NavigationPolicy.allows(destination,BuildConfig.APP_ROLE)){Toast.makeText(MainActivity.this,"This package opens its assigned LARP app only.",Toast.LENGTH_SHORT).show();return true;}
                if(request.getUrl().getQueryParameter("native")==null){view.loadUrl(request.getUrl().buildUpon().appendQueryParameter("native",BuildConfig.APP_ROLE).build().toString());return true;}
                return false;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){failed=false;offline.setVisibility(View.GONE);web.setVisibility(View.VISIBLE);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame()){failed=true;web.setVisibility(View.GONE);offline.setVisibility(View.VISIBLE);}
            }
            @Override public void onPageFinished(WebView view,String url){if(!failed)offline.setVisibility(View.GONE);}
        });
        // Release variants deliberately have no local HTTP exception and are not distributable builds.
        if(BuildConfig.DEBUG)web.loadUrl(HOME);
        else {web.setVisibility(View.GONE);offline.setVisibility(View.VISIBLE);text.setText("This local-server prototype supports debug builds only.");retry.setVisibility(View.GONE);}
    }
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){web.destroy();super.onDestroy();}
}
