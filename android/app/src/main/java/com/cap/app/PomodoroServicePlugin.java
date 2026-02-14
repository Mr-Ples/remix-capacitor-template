package com.cap.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "PomodoroService")
public class PomodoroServicePlugin extends Plugin {

    private static final String SCHEDULER_PREFS = "pomodoro_scheduler";
    private static final String KEY_HOUR = "hour";
    private static final String KEY_MINUTE = "minute";
    private static final String KEY_WORK_MIN = "workDurationMin";
    private static final String KEY_BREAK_MIN = "breakDurationMin";
    private static final String KEY_ROUNDS = "totalRounds";
    private static final String KEY_PROFILE_ID = "profileId";
    private static final String KEY_ACTIVITY_TAG = "activityTag";

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

    @PluginMethod
    public void cancelPhaseCompleteNotification(PluginCall call) {
        int roundNumber = call.getInt("roundNumber", 0);
        if (roundNumber < 1) {
            call.reject("roundNumber must be >= 1");
            return;
        }
        PomodoroForegroundService.cancelPhaseCompleteNotification(getContext(), roundNumber);
        call.resolve();
    }

    /** Start the scheduler foreground service. Shows "Session starting at HH:MM" and starts the session at that time. */
    @PluginMethod
    public void startSchedulerService(PluginCall call) {
        int hour = call.getInt("hour", 9);
        int minute = call.getInt("minute", 0);
        double workDurationMin = call.getDouble("workDurationMin", 25.0);
        double breakDurationMin = call.getDouble("breakDurationMin", 5.0);
        int totalRounds = call.getInt("totalRounds", 4);
        String profileId = call.getString("profileId", "");
        String activityTag = call.getString("activityTag", "");

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(SCHEDULER_PREFS, Context.MODE_PRIVATE);
        prefs.edit()
            .putInt(KEY_HOUR, hour)
            .putInt(KEY_MINUTE, minute)
            .putFloat(KEY_WORK_MIN, (float) workDurationMin)
            .putFloat(KEY_BREAK_MIN, (float) breakDurationMin)
            .putInt(KEY_ROUNDS, totalRounds)
            .putString(KEY_PROFILE_ID, profileId != null ? profileId : "")
            .putString(KEY_ACTIVITY_TAG, activityTag != null ? activityTag : "")
            .apply();

        Intent intent = new Intent(ctx, PomodoroForegroundService.class);
        intent.setAction(PomodoroForegroundService.ACTION_START_SCHEDULER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        call.resolve();
    }

    /** Stop the scheduler and clear its config. */
    @PluginMethod
    public void stopSchedulerService(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(SCHEDULER_PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        Intent intent = new Intent(ctx, PomodoroForegroundService.class);
        intent.setAction(PomodoroForegroundService.ACTION_STOP_SCHEDULER);
        ctx.startService(intent);
        call.resolve();
    }
}
