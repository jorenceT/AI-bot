package com.aicharacterbuilder.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int AUDIO_PERMISSION_REQUEST_CODE = 1001;
    private boolean hasRequestedAudioPermission = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidTtsPlugin.class);
        super.onCreate(savedInstanceState);
        requestAudioPermissionsIfNeeded();
    }

    @Override
    public void onResume() {
        super.onResume();
        requestAudioPermissionsIfNeeded();
    }

    private void requestAudioPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            if (hasRequestedAudioPermission) {
                return;
            }

            hasRequestedAudioPermission = true;
            ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.RECORD_AUDIO},
                AUDIO_PERMISSION_REQUEST_CODE
            );
            return;
        }

        hasRequestedAudioPermission = false;
    }
}
