package com.aicharacterbuilder.app;

import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "AndroidTts")
public class AndroidTtsPlugin extends Plugin {
    private TextToSpeech textToSpeech;
    private String currentUtteranceId;

    @PluginMethod
    public void getStatus(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity is not available.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (textToSpeech != null) {
                resolveStatus(call, TextToSpeech.SUCCESS);
                return;
            }

            textToSpeech = new TextToSpeech(getContext(), status -> resolveStatus(call, status));
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        Double rate = call.getDouble("rate", 1.0);
        Double pitch = call.getDouble("pitch", 1.0);

        if (text.isEmpty()) {
            call.reject("Text is required.");
            return;
        }

        ensureTextToSpeech(call, status -> {
            if (status != TextToSpeech.SUCCESS || textToSpeech == null) {
                call.reject("Android text-to-speech is not available.");
                return;
            }

            getActivity().runOnUiThread(() -> {
                textToSpeech.stop();
                textToSpeech.setPitch(pitch.floatValue());
                textToSpeech.setSpeechRate(rate.floatValue());
                textToSpeech.setOnUtteranceProgressListener(createUtteranceProgressListener());

                String utteranceId = "utterance_" + System.currentTimeMillis();
                currentUtteranceId = utteranceId;
                int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
                if (result == TextToSpeech.ERROR) {
                    call.reject("Android text-to-speech failed to start.");
                    return;
                }

                JSObject response = new JSObject();
                response.put("started", true);
                response.put("utteranceId", utteranceId);
                call.resolve(response);
            });
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (textToSpeech != null) {
            textToSpeech.stop();
        }
        currentUtteranceId = null;
        call.resolve();
    }

    private void ensureTextToSpeech(PluginCall call, TtsReadyCallback callback) {
        if (getActivity() == null) {
            call.reject("Activity is not available.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (textToSpeech != null) {
                callback.onReady(TextToSpeech.SUCCESS);
                return;
            }

            textToSpeech = new TextToSpeech(getContext(), callback::onReady);
        });
    }

    private UtteranceProgressListener createUtteranceProgressListener() {
        return new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                JSObject payload = new JSObject();
                payload.put("utteranceId", utteranceId);
                notifyListeners("ttsStart", payload);
            }

            @Override
            public void onDone(String utteranceId) {
                JSObject payload = new JSObject();
                payload.put("utteranceId", utteranceId);
                notifyListeners("ttsDone", payload);
            }

            @Override
            public void onError(String utteranceId) {
                JSObject payload = new JSObject();
                payload.put("utteranceId", utteranceId);
                notifyListeners("ttsError", payload);
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                JSObject payload = new JSObject();
                payload.put("utteranceId", utteranceId);
                payload.put("errorCode", errorCode);
                notifyListeners("ttsError", payload);
            }
        };
    }

    private void resolveStatus(PluginCall call, int initStatus) {
        JSObject result = new JSObject();
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);

        int currentVolume = audioManager != null ? audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) : -1;
        int maxVolume = audioManager != null ? audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC) : -1;
        boolean hasEngine = textToSpeech != null;
        boolean initialized = initStatus == TextToSpeech.SUCCESS;
        int languageAvailability = TextToSpeech.LANG_NOT_SUPPORTED;

        if (initialized && textToSpeech != null) {
            Locale locale = Locale.US;
            languageAvailability = textToSpeech.isLanguageAvailable(locale);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                textToSpeech.setLanguage(locale);
            }
        }

        result.put("available", hasEngine && initialized);
        result.put("hasEngine", hasEngine);
        result.put("initialized", initialized);
        result.put("currentEngine", textToSpeech != null ? textToSpeech.getDefaultEngine() : null);
        result.put("musicVolume", currentVolume);
        result.put("maxMusicVolume", maxVolume);
        result.put("isVolumeAudible", currentVolume > 0);
        result.put("languageAvailable", languageAvailability >= TextToSpeech.LANG_AVAILABLE);
        result.put("languageStatus", languageAvailability);
        result.put("hasVoices", Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP
            || (textToSpeech != null && textToSpeech.getVoices() != null && !textToSpeech.getVoices().isEmpty()));

        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
    }

    private interface TtsReadyCallback {
        void onReady(int status);
    }
}
