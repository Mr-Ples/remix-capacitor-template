package com.cap.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Receives notification actions (Stop, Start now). Delegates to the service's static handler
 * so we never start the foreground service from background (Android 12+ blocks that).
 * When the service is already running, the action runs in-process; only START_NOW may start
 * the service when it was killed.
 */
public class NotificationActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || context == null) return;
        String action = intent.getAction();
        if (PomodoroForegroundService.ACTION_STOP_SESSION.equals(action)
                || PomodoroForegroundService.ACTION_START_NOW.equals(action)) {
            PomodoroForegroundService.handleNotificationAction(context, action);
        }
    }
}
