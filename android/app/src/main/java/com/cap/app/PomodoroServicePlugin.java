package com.cap.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "PomodoroService")
public class PomodoroServicePlugin extends Plugin {

    @PluginMethod
    public void startSession(PluginCall call) {
        double workDurationMin = call.getDouble("workDurationMin", 25.0);
        double breakDurationMin = call.getDouble("breakDurationMin", 5.0);
        int totalRounds = call.getInt("totalRounds", 4);
        String profileId = call.getString("profileId", "");
        int currentRound = call.getInt("currentRound", 1);
        boolean isWorkPhase = call.getBoolean("isWorkPhase", true);
        long phaseStartTimeMillis = call.getLong("phaseStartTimeMillis", System.currentTimeMillis());
        int phaseDurationSec = call.getInt("phaseDurationSec", (int)(workDurationMin * 60));
        String activityTag = call.getString("activityTag", "");

        Intent serviceIntent = new Intent(getContext(), PomodoroForegroundService.class);
        serviceIntent.setAction(PomodoroForegroundService.ACTION_START_SESSION);
        serviceIntent.putExtra("workDurationMin", workDurationMin);
        serviceIntent.putExtra("breakDurationMin", breakDurationMin);
        serviceIntent.putExtra("totalRounds", totalRounds);
        serviceIntent.putExtra("profileId", profileId != null ? profileId : "");
        serviceIntent.putExtra("currentRound", currentRound);
        serviceIntent.putExtra("isWorkPhase", isWorkPhase);
        serviceIntent.putExtra("phaseStartTimeMillis", phaseStartTimeMillis);
        serviceIntent.putExtra("phaseDurationSec", phaseDurationSec);
        if (activityTag != null) {
            serviceIntent.putExtra("activityTag", activityTag);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), PomodoroForegroundService.class);
        serviceIntent.setAction(PomodoroForegroundService.ACTION_STOP_SESSION);
        getContext().startService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void getSessionState(PluginCall call) {
        try {
            JSONObject state = PomodoroForegroundService.getSessionState();
            JSObject result = JSObject.fromJSONObject(state);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get session state", e);
        }
    }

    @PluginMethod
    public void clearPendingLog(PluginCall call) {
        PomodoroForegroundService.clearPendingLog();
        call.resolve();
    }
}
