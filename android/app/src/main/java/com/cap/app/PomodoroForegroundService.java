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
import android.util.Log;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

public class PomodoroForegroundService extends Service {
    public static final String ACTION_START_SESSION = "START_SESSION";
    public static final String ACTION_STOP_SESSION = "STOP_SESSION";
    public static final String ACTION_START_SCHEDULER = "START_SCHEDULER";
    public static final String ACTION_STOP_SCHEDULER = "STOP_SCHEDULER";
    /** Start session now from scheduler notification button. */
    public static final String ACTION_START_NOW = "START_NOW";
    private static final String CHANNEL_ID = "PomodoroServiceChannel";
    private static final int NOTIFICATION_ID = 1;

    private static final String SCHEDULER_PREFS = "pomodoro_scheduler";
    private static final String KEY_HOUR = "hour";
    private static final String KEY_MINUTE = "minute";
    private static final String KEY_LAST_RUN_DAY = "lastRunDay";
    private static final String KEY_LAST_RUN_YEAR = "lastRunYear";
    private static final String KEY_LAST_RUN_HOUR = "lastRunHour";
    private static final String KEY_LAST_RUN_MINUTE = "lastRunMinute";
    private static final String KEY_WORK_MIN = "workDurationMin";
    private static final String KEY_BREAK_MIN = "breakDurationMin";
    private static final String KEY_ROUNDS = "totalRounds";
    private static final String KEY_PROFILE_ID_SCH = "profileId";
    private static final String KEY_ACTIVITY_TAG_SCH = "activityTag";
    /** Base ID for phase-complete notifications; each round uses PHASE_COMPLETE_NOTIFICATION_ID_BASE + roundNumber. */
    public static final int PHASE_COMPLETE_NOTIFICATION_ID_BASE = 1000;

    private static boolean isActive = false;
    /** True when the session was stopped because all rounds completed (not user stop/kill). */
    private static boolean sessionEndedNaturally = false;
    /** True when the user tapped Stop on the notification (so JS should end session, not restart). */
    private static boolean stoppedByUser = false;
    private static String profileId = "";
    private static int totalRounds = 4;
    private static int currentRound = 1;
    private static boolean isWorkPhase = true;
    private static long phaseEndTimeMillis = 0;
    private static int phaseDurationSec = 0;
    private static int workDurationSec = 0;
    private static int breakDurationSec = 0;
    private static String activityTag = "";
    /** Session start time (first phase start) for JS resume. */
    private static long sessionStartTimeMillis = 0;
    /** Queue of completed phases to be saved when app comes to foreground (or session ends). */
    private static List<JSONObject> pendingLogs = new ArrayList<>();

    /** Current service instance so notification actions can run stop/start without starting the service from background (Android 12+ restriction). */
    private static PomodoroForegroundService instance = null;

    private Handler handler;
    private Runnable updateRunnable;
    private boolean schedulerMode = false;
    private Runnable schedulerRunnable;
    private SharedPreferences schedulerPrefs;

    /**
     * Called by NotificationActionReceiver. Runs the action on the service's handler so we never
     * start the service from background (which fails on Android 12+). If the service is not
     * running, only START_NOW is attempted via startForegroundService (e.g. after process kill).
     */
    public static void handleNotificationAction(Context context, String action) {
        if (context == null || action == null) return;
        if (instance != null) {
            if (ACTION_STOP_SESSION.equals(action)) {
                instance.handler.post(() -> instance.stopSession());
            } else if (ACTION_START_NOW.equals(action) && instance.schedulerPrefs.contains(KEY_HOUR)) {
                instance.handler.post(() -> instance.startSessionFromSchedulerPrefs());
            }
            return;
        }
        if (ACTION_START_NOW.equals(action)) {
            try {
                Intent i = new Intent(context, PomodoroForegroundService.class);
                i.setAction(ACTION_START_NOW);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(i);
                } else {
                    context.startService(i);
                }
            } catch (Throwable ignored) { }
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
        handler = new Handler(Looper.getMainLooper());
        schedulerPrefs = getSharedPreferences(SCHEDULER_PREFS, Context.MODE_PRIVATE);
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
            sessionStartTimeMillis = phaseStartTimeMillis;
            isActive = true;
            sessionEndedNaturally = false;
            stoppedByUser = false;
            pendingLogs.clear();

            startForeground(NOTIFICATION_ID, createNotification());
            startUpdateLoop();
        } else if (ACTION_STOP_SESSION.equals(action)) {
            stopSession();
        } else if (ACTION_START_SCHEDULER.equals(action)) {
            schedulerMode = true;
            startForeground(NOTIFICATION_ID, buildSchedulerNotification());
            startSchedulerLoop();
        } else if (ACTION_STOP_SCHEDULER.equals(action)) {
            schedulerMode = false;
            if (schedulerRunnable != null) {
                handler.removeCallbacks(schedulerRunnable);
                schedulerRunnable = null;
            }
            schedulerPrefs.edit().clear().apply();
            stopForeground(true);
            stopSelf();
        } else if (ACTION_START_NOW.equals(action)) {
            if (schedulerPrefs.contains(KEY_HOUR)) {
                startSessionFromSchedulerPrefs();
            }
        }

        return START_STICKY;
    }

    /** Start a session from scheduler prefs (used by "Start now" button and when time is reached). */
    private void startSessionFromSchedulerPrefs() {
        if (!schedulerPrefs.contains(KEY_HOUR)) return;
        int runHour = schedulerPrefs.getInt(KEY_HOUR, 9);
        int runMinute = schedulerPrefs.getInt(KEY_MINUTE, 0);
        Calendar now = Calendar.getInstance();
        int todayDay = now.get(Calendar.DAY_OF_YEAR);
        int todayYear = now.get(Calendar.YEAR);
        schedulerPrefs.edit()
            .putInt(KEY_LAST_RUN_DAY, todayDay)
            .putInt(KEY_LAST_RUN_YEAR, todayYear)
            .putInt(KEY_LAST_RUN_HOUR, runHour)
            .putInt(KEY_LAST_RUN_MINUTE, runMinute)
            .apply();

        schedulerMode = false;
        if (schedulerRunnable != null) {
            handler.removeCallbacks(schedulerRunnable);
            schedulerRunnable = null;
        }

        double workMin = schedulerPrefs.getFloat(KEY_WORK_MIN, 25f);
        double breakMin = schedulerPrefs.getFloat(KEY_BREAK_MIN, 5f);
        int rounds = schedulerPrefs.getInt(KEY_ROUNDS, 4);
        String profId = schedulerPrefs.getString(KEY_PROFILE_ID_SCH, "");
        String actTag = schedulerPrefs.getString(KEY_ACTIVITY_TAG_SCH, "");

        long nowMs = System.currentTimeMillis();
        int workSec = (int) (workMin * 60);
        profileId = profId != null ? profId : "";
        activityTag = actTag != null ? actTag : "";
        totalRounds = rounds;
        currentRound = 1;
        isWorkPhase = true;
        workDurationSec = (int) (workMin * 60);
        breakDurationSec = (int) (breakMin * 60);
        phaseDurationSec = workSec;
        phaseEndTimeMillis = nowMs + (workSec * 1000L);
        sessionStartTimeMillis = nowMs;
        isActive = true;
        sessionEndedNaturally = false;
        stoppedByUser = false;
        pendingLogs.clear();

        startForeground(NOTIFICATION_ID, createNotification());
        startUpdateLoop();
    }

    private static final int PI_FLAGS = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

    private Notification buildSchedulerNotification() {
        int hour = schedulerPrefs.getInt(KEY_HOUR, 9);
        int minute = schedulerPrefs.getInt(KEY_MINUTE, 0);
        String timeStr = String.format("%02d:%02d", hour, minute);
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(this, 0, open, PI_FLAGS);
        Intent startNow = new Intent(this, NotificationActionReceiver.class);
        startNow.setAction(ACTION_START_NOW);
        PendingIntent startNowPi = PendingIntent.getBroadcast(this, 100, startNow, PI_FLAGS);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Pomodoro Auto-Start")
            .setContentText("Session starting at " + timeStr)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentIntent(contentPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_media_play, "Start now", startNowPi)
            .build();
    }

    /** Scheduler loop: check every 5 seconds if it's time to start (same as "Start now"). */
    private static final long SCHEDULER_CHECK_MS = 5_000;
    private static final String TAG = "PomodoroScheduler";

    private void startSchedulerLoop() {
        Log.d(TAG, "startSchedulerLoop: starting");
        if (schedulerRunnable != null) {
            handler.removeCallbacks(schedulerRunnable);
        }
        schedulerRunnable = new Runnable() {
            @Override
            public void run() {
                if (schedulerMode && schedulerRunnable != null) {
                    handler.postDelayed(schedulerRunnable, SCHEDULER_CHECK_MS);
                }
                if (!schedulerMode) {
                    Log.d(TAG, "scheduler tick: schedulerMode=false, skipping");
                    return;
                }
                if (!schedulerPrefs.contains(KEY_HOUR)) {
                    Log.d(TAG, "scheduler tick: no KEY_HOUR in prefs, stopping");
                    stopSelf();
                    return;
                }
                int hour = schedulerPrefs.getInt(KEY_HOUR, 9);
                int minute = schedulerPrefs.getInt(KEY_MINUTE, 0);
                Calendar now = Calendar.getInstance();
                int todayDay = now.get(Calendar.DAY_OF_YEAR);
                int todayYear = now.get(Calendar.YEAR);
                int currentMins = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
                int scheduledMins = hour * 60 + minute;

                int lastRunDay = schedulerPrefs.getInt(KEY_LAST_RUN_DAY, -1);
                int lastRunYear = schedulerPrefs.getInt(KEY_LAST_RUN_YEAR, -1);
                int lastRunHour = schedulerPrefs.getInt(KEY_LAST_RUN_HOUR, -1);
                int lastRunMinute = schedulerPrefs.getInt(KEY_LAST_RUN_MINUTE, -1);

                Log.d(TAG, "scheduler tick: scheduled=" + hour + ":" + String.format("%02d", minute)
                    + " (" + scheduledMins + " min), now=" + currentMins + " min, lastRun=" + lastRunDay + "/" + lastRunYear + "@" + lastRunHour + ":" + String.format("%02d", lastRunMinute) + ", today=" + todayDay + "/" + todayYear);

                // Only skip if we already ran today *at this exact scheduled time* (so changing time or running earlier at different time doesn't block)
                if (lastRunDay == todayDay && lastRunYear == todayYear && lastRunHour == hour && lastRunMinute == minute) {
                    Log.d(TAG, "scheduler tick: already ran today at this time, skipping");
                    return;
                }
                if (currentMins < scheduledMins) {
                    Log.d(TAG, "scheduler tick: not yet time, next check in " + (SCHEDULER_CHECK_MS / 1000) + "s");
                    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                    if (nm != null) nm.notify(NOTIFICATION_ID, buildSchedulerNotification());
                    return;
                }

                Log.d(TAG, "scheduler tick: TIME REACHED -> calling handleNotificationAction(ACTION_START_NOW)");
                handleNotificationAction(PomodoroForegroundService.this, ACTION_START_NOW);
            }
        };
        handler.post(schedulerRunnable);
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
        // Queue pending log for the completed phase (so multiple rounds in background are all saved)
        try {
            JSONObject entry = new JSONObject();
            entry.put("roundNumber", currentRound);
            entry.put("phaseType", isWorkPhase ? "work" : "break");
            entry.put("phaseEndTimeMillis", System.currentTimeMillis());
            entry.put("activityTag", activityTag != null ? activityTag : "");
            pendingLogs.add(entry);
        } catch (JSONException e) {
            e.printStackTrace();
        }

        // Show phase complete notification
        showPhaseCompleteNotification();

        // Move to next phase or round
        if (isWorkPhase) {
            // Work phase ended -> Break starts or Round ends (if no break)
            if (breakDurationSec > 0) {
                // Break starts -> Vibrate
                vibrate(false);
                isWorkPhase = false;
                phaseDurationSec = breakDurationSec;
                phaseEndTimeMillis = System.currentTimeMillis() + (phaseDurationSec * 1000L);
            } else {
                // No break, move to next round -> This is a round end
                vibrate(true);
                currentRound++;
                if (currentRound > totalRounds) {
                    sessionEndedNaturally = true;
                    stopSession();
                    return;
                }
                isWorkPhase = true;
                phaseDurationSec = workDurationSec;
                phaseEndTimeMillis = System.currentTimeMillis() + (phaseDurationSec * 1000L);
            }
        } else {
            // Break phase ended -> Round ends
            vibrate(true);
            currentRound++;
            if (currentRound > totalRounds) {
                sessionEndedNaturally = true;
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

    private void vibrate(boolean isRoundEnd) {
        Vibrator v;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            v = vm.getDefaultVibrator();
        } else {
            v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (v != null && v.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                long[] pattern;
                if (isRoundEnd) {
                    // Double pulse for round end
                    pattern = new long[]{0, 200, 100, 200};
                } else {
                    // Single pulse for break start
                    pattern = new long[]{0, 200};
                }
                v.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                v.vibrate(isRoundEnd ? 500 : 200);
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
        notificationManager.notify(PHASE_COMPLETE_NOTIFICATION_ID_BASE + currentRound, notif);
    }

    /**
     * Dismisses the phase-complete notification for the given round (e.g. after user saves in the round-complete popup).
     * Safe to call from the plugin; only cancels the notification with ID PHASE_COMPLETE_NOTIFICATION_ID_BASE + roundNumber.
     */
    public static void cancelPhaseCompleteNotification(Context context, int roundNumber) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(PHASE_COMPLETE_NOTIFICATION_ID_BASE + roundNumber);
        }
    }

    private void stopSession() {
        isActive = false;
        stoppedByUser = true;
        if (updateRunnable != null) {
            handler.removeCallbacks(updateRunnable);
            updateRunnable = null;
        }
        if (schedulerPrefs.contains(KEY_HOUR)) {
            schedulerMode = true;
            startForeground(NOTIFICATION_ID, buildSchedulerNotification());
            startSchedulerLoop();
        } else {
            stopForeground(true);
            stopSelf();
        }
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent contentPi = PendingIntent.getActivity(this, 0, notificationIntent, PI_FLAGS);
        Intent stopIntent = new Intent(this, NotificationActionReceiver.class);
        stopIntent.setAction(ACTION_STOP_SESSION);
        PendingIntent stopPi = PendingIntent.getBroadcast(this, 101, stopIntent, PI_FLAGS);

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
            .setContentIntent(contentPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_delete, "Stop", stopPi)
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
        instance = null;
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
            if (!isActive) {
                state.put("sessionEndedNaturally", sessionEndedNaturally);
                state.put("stoppedByUser", stoppedByUser);
            }
            if (isActive) {
                state.put("profileId", profileId);
                state.put("sessionStartTime", sessionStartTimeMillis);
                state.put("totalRounds", totalRounds);
                state.put("currentRound", currentRound);
                state.put("isWorkPhase", isWorkPhase);
                state.put("phaseEndTimeMillis", phaseEndTimeMillis);
                long now = System.currentTimeMillis();
                long timeRemainingMs = Math.max(0, phaseEndTimeMillis - now);
                state.put("timeRemainingSec", (int) (timeRemainingMs / 1000));
                state.put("phaseDurationSec", phaseDurationSec);
                state.put("activityTag", activityTag);
                if (!pendingLogs.isEmpty()) {
                    state.put("pendingLogs", new JSONArray(pendingLogs));
                }
            }
            if (!isActive && !pendingLogs.isEmpty()) {
                state.put("pendingLogs", new JSONArray(pendingLogs));
            }
        } catch (JSONException e) {
            e.printStackTrace();
        }
        return state;
    }

    public static void clearPendingLog() {
        pendingLogs.clear();
    }
}
