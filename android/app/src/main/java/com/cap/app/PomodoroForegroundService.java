package com.cap.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;

public class PomodoroForegroundService extends Service {
    public static final String ACTION_START = "START";
    public static final String ACTION_STOP = "STOP";
    private static final String CHANNEL_ID = "PomodoroServiceChannel";
    private static final int NOTIFICATION_ID = 1;

    private static boolean isActive = false;
    private static String profileId = "";
    private static int totalRounds = 4;
    private static int currentRound = 1;
    private static boolean isWorkPhase = true;
    private static long phaseEndTimeMillis = 0;
    private static int phaseDurationSec = 0;
    private static String activityTag = "";
    private static JSObject pendingLog = null;

    private Handler handler;
    private Runnable updateRunnable;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        handler = new Handler(Looper.getMainLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            int workDurationMin = intent.getIntExtra("workDurationMin", 25);
            int breakDurationMin = intent.getIntExtra("breakDurationMin", 5);
            totalRounds = intent.getIntExtra("totalRounds", 4);
            profileId = intent.getStringExtra("profileId");
            currentRound = intent.getIntExtra("currentRound", 1);
            isWorkPhase = intent.getBooleanExtra("isWorkPhase", true);
            long phaseStartTimeMillis = intent.getLongExtra("phaseStartTimeMillis", System.currentTimeMillis());
            phaseDurationSec = intent.getIntExtra("phaseDurationSec", workDurationMin * 60);
            activityTag = intent.getStringExtra("activityTag");
            if (activityTag == null) activityTag = "";

            phaseEndTimeMillis = phaseStartTimeMillis + (phaseDurationSec * 1000L);
            isActive = true;

            startForeground(NOTIFICATION_ID, createNotification());
            startUpdateLoop();
        } else if (ACTION_STOP.equals(action)) {
            stopSession();
        }

        return START_STICKY;
    }

    private void startUpdateLoop() {
        if (updateRunnable != null) {
            handler.removeCallbacks(updateRunnable);
        }

        updateRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isActive) return;

                long now = System.currentTimeMillis();
                long timeRemainingMs = phaseEndTimeMillis - now;

                if (timeRemainingMs <= 0) {
                    // Phase ended
                    handlePhaseEnd();
                } else {
                    // Update notification
                    NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                    notificationManager.notify(NOTIFICATION_ID, createNotification());
                    handler.postDelayed(this, 1000);
                }
            }
        };

        handler.post(updateRunnable);
    }

    private void handlePhaseEnd() {
        // Store pending log for the completed phase
        pendingLog = new JSObject();
        pendingLog.put("roundNumber", currentRound);
        pendingLog.put("phaseType", isWorkPhase ? "work" : "break");

        // Move to next phase or round
        if (isWorkPhase) {
            // Work phase ended
            int breakDurationMin = 5; // Default, should be passed from intent
            if (breakDurationMin > 0) {
                isWorkPhase = false;
                phaseDurationSec = breakDurationMin * 60;
                phaseEndTimeMillis = System.currentTimeMillis() + (phaseDurationSec * 1000L);
            } else {
                // No break, move to next round
                currentRound++;
                if (currentRound > totalRounds) {
                    stopSession();
                    return;
                }
            }
        } else {
            // Break phase ended
            currentRound++;
            if (currentRound > totalRounds) {
                stopSession();
                return;
            }
            isWorkPhase = true;
            int workDurationMin = 25; // Default, should be passed from intent
            phaseDurationSec = workDurationMin * 60;
            phaseEndTimeMillis = System.currentTimeMillis() + (phaseDurationSec * 1000L);
        }

        // Continue the loop
        startUpdateLoop();
    }

    private void stopSession() {
        isActive = false;
        if (updateRunnable != null) {
            handler.removeCallbacks(updateRunnable);
        }
        stopForeground(true);
        stopSelf();
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        );

        long now = System.currentTimeMillis();
        long timeRemainingMs = Math.max(0, phaseEndTimeMillis - now);
        int timeRemainingSec = (int) (timeRemainingMs / 1000);
        int mins = timeRemainingSec / 60;
        int secs = timeRemainingSec % 60;
        String timeStr = String.format("%02d:%02d", mins, secs);

        String phase = isWorkPhase ? "Work Session" : "Break Time";
        if (!activityTag.isEmpty()) {
            phase += " - " + activityTag;
        }

        String content = String.format("Round %d/%d - %s remaining", currentRound, totalRounds, timeStr);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(phase)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_ID,
                "Pomodoro Timer",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(serviceChannel);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (updateRunnable != null) {
            handler.removeCallbacks(updateRunnable);
        }
    }

    // Static methods to access state from the plugin
    public static JSObject getCurrentState() {
        JSObject state = new JSObject();
        state.put("isActive", isActive);
        if (isActive) {
            state.put("profileId", profileId);
            state.put("totalRounds", totalRounds);
            state.put("currentRound", currentRound);
            state.put("isWorkPhase", isWorkPhase);
            state.put("phaseEndTimeMillis", phaseEndTimeMillis);
            long now = System.currentTimeMillis();
            long timeRemainingMs = Math.max(0, phaseEndTimeMillis - now);
            state.put("timeRemainingSec", (int) (timeRemainingMs / 1000));
            state.put("phaseDurationSec", phaseDurationSec);
            state.put("activityTag", activityTag);
            if (pendingLog != null) {
                state.put("pendingLog", pendingLog);
            }
        }
        return state;
    }

    public static void clearPendingLog() {
        pendingLog = null;
    }
}
