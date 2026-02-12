package com.cap.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import org.json.JSONException;
import org.json.JSONObject;

public class PomodoroForegroundService extends Service {
    public static final String ACTION_START_SESSION = "START_SESSION";
    public static final String ACTION_STOP_SESSION = "STOP_SESSION";
    private static final String CHANNEL_ID = "PomodoroServiceChannel";
    private static final int NOTIFICATION_ID = 1;

    private static boolean isActive = false;
    private static String profileId = "";
    private static int totalRounds = 4;
    private static int currentRound = 1;
    private static boolean isWorkPhase = true;
    private static long phaseEndTimeMillis = 0;
    private static int phaseDurationSec = 0;
    private static int workDurationSec = 0;
    private static int breakDurationSec = 0;
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
        if (ACTION_START_SESSION.equals(action)) {
            double workDurationMin = intent.getDoubleExtra("workDurationMin", 25.0);
            double breakDurationMin = intent.getDoubleExtra("breakDurationMin", 5.0);
            totalRounds = intent.getIntExtra("totalRounds", 4);
            profileId = intent.getStringExtra("profileId");
            if (profileId == null) profileId = "";
            currentRound = intent.getIntExtra("currentRound", 1);
            isWorkPhase = intent.getBooleanExtra("isWorkPhase", true);
            long phaseStartTimeMillis = intent.getLongExtra("phaseStartTimeMillis", System.currentTimeMillis());
            int providedPhaseDurationSec = intent.getIntExtra("phaseDurationSec", -1);
            activityTag = intent.getStringExtra("activityTag");
            if (activityTag == null) activityTag = "";

            workDurationSec = (int)(workDurationMin * 60);
            breakDurationSec = (int)(breakDurationMin * 60);
            
            if (providedPhaseDurationSec > 0) {
                phaseDurationSec = providedPhaseDurationSec;
            } else {
                phaseDurationSec = isWorkPhase ? workDurationSec : breakDurationSec;
            }

            phaseEndTimeMillis = phaseStartTimeMillis + (phaseDurationSec * 1000L);
            isActive = true;
            pendingLog = null;

            startForeground(NOTIFICATION_ID, createNotification());
            startUpdateLoop();
        } else if (ACTION_STOP_SESSION.equals(action)) {
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
        // Vibrate
        vibrate();
        
        // Store pending log for the completed phase
        pendingLog = new JSObject();
        pendingLog.put("roundNumber", currentRound);
        pendingLog.put("phaseType", isWorkPhase ? "work" : "break");

        // Show phase complete notification
        showPhaseCompleteNotification();

        // Move to next phase or round
        if (isWorkPhase) {
            // Work phase ended
            if (breakDurationSec > 0) {
                isWorkPhase = false;
                phaseDurationSec = breakDurationSec;
                phaseEndTimeMillis = System.currentTimeMillis() + (phaseDurationSec * 1000L);
            } else {
                // No break, move to next round
                currentRound++;
                if (currentRound > totalRounds) {
                    stopSession();
                    return;
                }
                isWorkPhase = true;
                phaseDurationSec = workDurationSec;
                phaseEndTimeMillis = System.currentTimeMillis() + (phaseDurationSec * 1000L);
            }
        } else {
            // Break phase ended
            currentRound++;
            if (currentRound > totalRounds) {
                stopSession();
                return;
            }
            isWorkPhase = true;
            phaseDurationSec = workDurationSec;
            phaseEndTimeMillis = System.currentTimeMillis() + (phaseDurationSec * 1000L);
        }

        // Continue the loop
        startUpdateLoop();
    }

    private void vibrate() {
        Vibrator v;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            v = vm.getDefaultVibrator();
        } else {
            v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (v != null && v.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(new long[]{0, 200, 100, 200, 100, 200}, -1));
            } else {
                v.vibrate(500);
            }
        }
    }

    private void showPhaseCompleteNotification() {
        String title = isWorkPhase ? "Work phase complete" : "Break complete";
        String body = "Round " + currentRound + "/" + totalRounds + " – Tap to log";
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("pomodoro_open_log", true);
        PendingIntent pi = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        notificationManager.notify(1000 + currentRound, notif);
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
    public static JSONObject getSessionState() {
        JSONObject state = new JSONObject();
        try {
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
                    JSONObject pendingLogJson = new JSONObject();
                    pendingLogJson.put("roundNumber", pendingLog.getInt("roundNumber"));
                    pendingLogJson.put("phaseType", pendingLog.getString("phaseType"));
                    state.put("pendingLog", pendingLogJson);
                }
            }
        } catch (JSONException e) {
            e.printStackTrace();
        }
        return state;
    }

    public static void clearPendingLog() {
        pendingLog = null;
    }
}
