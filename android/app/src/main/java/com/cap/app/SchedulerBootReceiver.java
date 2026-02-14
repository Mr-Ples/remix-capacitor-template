package com.cap.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * On boot, start the scheduler service if auto-start was enabled (config is in prefs).
 */
public class SchedulerBootReceiver extends BroadcastReceiver {
    private static final String PREFS = "pomodoro_scheduler";
    private static final String KEY_HOUR = "hour";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains(KEY_HOUR)) {
            return;
        }
        Intent serviceIntent = new Intent(context, PomodoroForegroundService.class);
        serviceIntent.setAction(PomodoroForegroundService.ACTION_START_SCHEDULER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
