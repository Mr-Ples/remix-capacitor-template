package com.cap.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PomodoroService")
public class PomodoroServicePlugin extends Plugin {

    @PluginMethod
    public void startSession(PluginCall call) {
        int workDurationMin = call.getInt("workDurationMin", 25);
        int breakDurationMin = call.getInt("breakDurationMin", 5);
        int totalRounds = call.getInt("totalRounds", 4);
        String profileId = call.getString("profileId", "");
        int currentRound = call.getInt("currentRound", 1);
        boolean isWorkPhase = call.getBoolean("isWorkPhase", true);
        long phaseStartTimeMillis = call.getLong("phaseStartTimeMillis", System.currentTimeMillis());
        int phaseDurationSec = call.getInt("phaseDurationSec", workDurationMin * 60);
        String activityTag = call.getString("activityTag", "");

        Intent serviceIntent = new Intent(getContext(), PomodoroForegroundService.class);
        serviceIntent.setAction(PomodoroForegroundService.ACTION_START);
        serviceIntent.putExtra("workDurationMin", workDurationMin);
        serviceIntent.putExtra("breakDurationMin", breakDurationMin);
        serviceIntent.putExtra("totalRounds", totalRounds);
        serviceIntent.putExtra("profileId", profileId);
        serviceIntent.putExtra("currentRound", currentRound);
        serviceIntent.putExtra("isWorkPhase", isWorkPhase);
        serviceIntent.putExtra("phaseStartTimeMillis", phaseStartTimeMillis);
        serviceIntent.putExtra("phaseDurationSec", phaseDurationSec);
        serviceIntent.putExtra("activityTag", activityTag);

        getContext().startForegroundService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), PomodoroForegroundService.class);
        serviceIntent.setAction(PomodoroForegroundService.ACTION_STOP);
        getContext().startService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void getSessionState(PluginCall call) {
        JSObject state = PomodoroForegroundService.getCurrentState();
        call.resolve(state);
    }

    @PluginMethod
    public void clearPendingLog(PluginCall call) {
        PomodoroForegroundService.clearPendingLog();
        call.resolve();
    }
}
