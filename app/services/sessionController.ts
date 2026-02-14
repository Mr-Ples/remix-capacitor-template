import type { Profile, SessionState, SuspendedRound, SessionLog } from '../types/pomodoro';
import type { PomodoroSessionState } from './pomodoroService';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import PomodoroService from './pomodoroService';
import { StorageService } from './storage';
import { NotificationService } from './notifications';

/**
 * Session lifecycle rules:
 * - A new session starts ONLY when: user taps Start, or auto-start at configured start time.
 * - A session ends ONLY when: user taps End, last round completes, or end time is reached.
 * - We never start or stop a session when app goes to background/foreground; we only sync
 *   or resume. When the native service completes all rounds in background we end the
 *   session on JS (sessionEndedNaturally) and do NOT restart the timer.
 */

export type SessionEventType = 'tick' | 'phaseEnd' | 'sessionEnd' | 'stateChange' | 'logsUpdated' | 'pendingLogsToShow';

/** One completed round to show in the logging modal (for background-completed rounds). */
export interface PendingLogToShow {
  logId: string;
  roundNumber: number;
  phaseType: 'work' | 'break';
  activityTag?: string;
  profileId: string;
  sessionStartTime: string;
  totalRounds: number;
}

export interface SessionEvent {
  type: SessionEventType;
  state: SessionState | null;
  /** When type is 'pendingLogsToShow', show the logging modal for each of these in sequence. */
  pendingLogsToShow?: PendingLogToShow[];
}

export class SessionController {
  private static instance: SessionController;

  public static getInstance(): SessionController {
    if (!SessionController.instance) {
      SessionController.instance = new SessionController();
    }
    return SessionController.instance;
  }

  private state: SessionState | null = null;
  private profile: Profile | null = null;
  private intervalId: number | null = null;
  private listeners: Set<(event: SessionEvent) => void> = new Set();
  private ongoingNotificationInterval: number | null = null;
  private useNativeService: boolean = Capacitor.getPlatform() === 'android';
  private lastCompletedWorkPhaseState: SessionState | null = null; // New field to store work phase state for logging


  constructor() {
    this.setupNotificationListeners();
    this.setupAppListeners();
  }

  private setupNotificationListeners() {
    NotificationService.setupNotificationListeners((data) => {
      if (data.phaseType && !data.ongoing) {
        // Notification clicked for logging - handled by UI
        this.emit({ type: 'phaseEnd', state: this.state! });
      }
    });
  }

  removeNotificationListeners() {
    NotificationService.removeNotificationListeners();
  }

  addEventListener(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    // Immediately emit current state to new listener so UI syncs up
    if (this.state) {
      listener({ type: 'stateChange', state: this.state });
    }
    return () => this.listeners.delete(listener);
  }

  private emit(event: SessionEvent) {
    // Use the state from the event when provided (e.g. phaseEnd sends completed round state);
    // otherwise clone this.state so React detects the change.
    const stateToSend = event.state ? { ...event.state } : (this.state ? { ...this.state } : null);
    this.listeners.forEach(listener => listener({
      ...event,
      state: stateToSend as SessionState
    }));
  }

  async startSession(profile: Profile, activityTag?: string): Promise<void> {
    this.profile = profile;

    const now = new Date();
    const nowMinutes =
      now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    const workDurationSec = profile.workDuration;
    const breakDurationSec = profile.breakDuration;
    const roundLengthSec = workDurationSec + breakDurationSec;

    let totalRounds = profile.rounds;
    let isWorkPhase = true;
    let phaseDurationSec = workDurationSec;
    let phaseStartTimeMillis = Date.now();
    let elapsedTimeSec = 0;

    // When a profile is configured to use an end time, calculate how many
    // rounds fit between "now" and that end time, and if we're in the
    // middle of a round, start with a shortened first round instead of
    // a shortened last round.
    if (
      profile.useEndTime &&
      profile.endTime &&
      roundLengthSec > 0
    ) {
      const [endHourStr, endMinStr] = profile.endTime.split(':');
      const endHour = parseInt(endHourStr || '0', 10);
      const endMinute = parseInt(endMinStr || '0', 10);
      const endMinutes = endHour * 60 + endMinute; // End time is still in minutes from midnight

      const minutesUntilEnd = endMinutes - nowMinutes; // Remaining time until end in minutes

      if (minutesUntilEnd > 0) {
        const rawRounds = (minutesUntilEnd * 60) / roundLengthSec; // Convert minutesUntilEnd to seconds for calculation
        const computedRounds = Math.ceil(rawRounds);

        if (computedRounds >= 1) {
          totalRounds = computedRounds;

          // Total remaining time in the first (possibly shortened) round in seconds
          const remainingFirstRoundSec =
            (minutesUntilEnd * 60) - (computedRounds - 1) * roundLengthSec;

          // Offset into the conceptual round where we are starting in seconds
          const offsetWithinRoundSec =
            roundLengthSec - remainingFirstRoundSec;

          // Determine current phase and how far into it we are
          if (offsetWithinRoundSec < workDurationSec && workDurationSec > 0) {
            // In work phase
            isWorkPhase = true;
            const offsetWithinWorkSec = Math.max(
              0,
              Math.min(offsetWithinRoundSec, workDurationSec)
            );
            // For a shortened first phase, calculate the actual remaining time
            const remainingWorkSec = workDurationSec - offsetWithinWorkSec;
            phaseDurationSec = Math.round(remainingWorkSec);
            elapsedTimeSec = 0;  // Start from 0 since we're setting duration to remaining time
            phaseStartTimeMillis = Date.now();
          } else if (breakDurationSec > 0) {
            // In break phase
            isWorkPhase = false;
            const offsetWithinBreakSec = Math.max(
              0,
              Math.min(
                offsetWithinRoundSec - workDurationSec,
                breakDurationSec
              )
            );
            // For a shortened first phase, calculate the actual remaining time
            const remainingBreakSec = breakDurationSec - offsetWithinBreakSec;
            phaseDurationSec = Math.round(remainingBreakSec);
            elapsedTimeSec = 0;  // Start from 0 since we're setting duration to remaining time
            phaseStartTimeMillis = Date.now();
          } else {
            // Edge case: work is 0 or we're past both phases somehow
            // Default to work phase with no time elapsed
            isWorkPhase = true;
            phaseDurationSec = workDurationSec;
            elapsedTimeSec = 0;
            phaseStartTimeMillis = Date.now();
          }
        }
      }
    }

    this.state = {
      profileId: profile.id,
      currentRound: 1,
      totalRounds,
      isWorkPhase,
      startTime: phaseStartTimeMillis,
      sessionStartTime: Date.now(), // Track when the entire session started
      elapsedTime: elapsedTimeSec,
      phaseDuration: phaseDurationSec,
      isActive: true,
      currentActivityTag: activityTag,
      timeRemaining: this.state?.timeRemaining,
    };

    await StorageService.saveSessionState(this.state);
    await NotificationService.initialize();

    // Start native foreground service on Android so the notification
    // countdown keeps running even if the JS runtime is killed.
    if (this.useNativeService) {
      await PomodoroService.startSession({
        workDurationMin: profile.workDuration / 60, // Convert to minutes for native service
        breakDurationMin: profile.breakDuration / 60, // Convert to minutes for native service
        totalRounds,
        profileId: profile.id,
        currentRound: this.state.currentRound,
        isWorkPhase,
        phaseStartTimeMillis: phaseStartTimeMillis,
        phaseDurationSec: phaseDurationSec,
        activityTag,
      });
    }

    this.startTimer();
    this.startOngoingNotification();
    this.emit({ type: 'stateChange', state: this.state });
  }

  async resumeSession(): Promise<boolean> {
    // If we already have an active session in memory, just return true
    if (this.state && this.state.isActive) {
      // Ensure timer is running just in case
      if (!this.intervalId) {
        this.startTimer();
        this.startOngoingNotification();
      }
      this.emit({ type: 'stateChange', state: this.state });
      return true;
    }

    // On Android, use the native foreground service as the source of truth
    // so the notification countdown and JS state stay perfectly in sync.
    if (this.useNativeService) {
      const nativeState = await PomodoroService.getSessionState();
      if (nativeState.isActive) {
        const profiles = await StorageService.getProfiles();
        this.profile = profiles.find(p => p.id === nativeState.profileId) || null;

        if (!this.profile) {
          await StorageService.clearSessionState();
          return false;
        }

        // Session may have been started by the scheduler service (app was closed). Sync lastAutoStartDay.
        if (this.profile.autoStartTime) {
          const today = new Date().toISOString().split('T')[0];
          if (this.profile.lastAutoStartDay !== today) {
            const updatedProfile = { ...this.profile, lastAutoStartDay: today, updatedAt: new Date().toISOString() };
            await StorageService.updateProfile(updatedProfile);
            this.profile = updatedProfile;
          }
        }

        // Preserve session identity: use stored sessionStartTime so logs stay in the same session
        const savedState = await StorageService.getSessionState();
        const phaseDurationSec = nativeState.phaseDurationSec ?? 0;
        const timeRemainingSec = nativeState.timeRemainingSec ?? 0;
        const elapsedTime = Math.max(0, phaseDurationSec - timeRemainingSec);
        const phaseEndTimeMillis = nativeState.phaseEndTimeMillis ?? Date.now();
        const startTime = phaseEndTimeMillis - phaseDurationSec * 1000;

        this.state = {
          profileId: nativeState.profileId!,
          currentRound: nativeState.currentRound ?? 1,
          totalRounds: nativeState.totalRounds ?? this.profile.rounds,
          isWorkPhase: nativeState.isWorkPhase ?? true,
          startTime,
          sessionStartTime: savedState?.sessionStartTime ?? nativeState.sessionStartTime ?? startTime,
          elapsedTime,
          phaseDuration: phaseDurationSec,
          isActive: true,
          currentActivityTag: nativeState.activityTag,
        };

        await NotificationService.initialize();
        this.startTimer();
        this.startOngoingNotification();
        this.emit({ type: 'stateChange', state: this.state });
        await this.processPendingLogsFromNative(nativeState);
        return true;
      }
    }

    // Fallback: JS-only stored session (web / no native session running)
    const savedState = await StorageService.getSessionState();
    if (!savedState || !savedState.isActive) {
      return false;
    }

    const profiles = await StorageService.getProfiles();
    this.profile = profiles.find(p => p.id === savedState.profileId) || null;

    if (!this.profile) {
      await StorageService.clearSessionState();
      return false;
    }

    // Calculate elapsed time since last save
    const now = Date.now();
    const timeSinceLastSave = Math.floor((now - savedState.startTime) / 1000);

    this.state = {
      ...savedState,
      elapsedTime: timeSinceLastSave,
      sessionStartTime: savedState.sessionStartTime ?? savedState.startTime, // Fallback for old sessions
    };

    await NotificationService.initialize();
    // On Android, restart the native service so the session continues (notification + timer)
    if (this.useNativeService && this.profile) {
      await PomodoroService.startSession({
        workDurationMin: this.profile.workDuration / 60,
        breakDurationMin: this.profile.breakDuration / 60,
        totalRounds: this.state.totalRounds,
        profileId: this.profile.id,
        currentRound: this.state.currentRound,
        isWorkPhase: this.state.isWorkPhase,
        phaseStartTimeMillis: this.state.startTime,
        phaseDurationSec: this.state.phaseDuration,
        activityTag: this.state.currentActivityTag,
      }).catch(() => {});
    }
    this.startTimer();
    this.startOngoingNotification();
    this.emit({ type: 'stateChange', state: this.state });

    return true;
  }

  pauseSession(): void {
    if (this.state) {
      this.state.isActive = false;
      this.state.pausedAt = Date.now();
      this.stopTimer();
      this.stopOngoingNotification();
      // Stop native foreground service when pausing on Android
      if (this.useNativeService) {
        PomodoroService.stopSession().catch(() => { });
      }
      StorageService.saveSessionState(this.state);
      this.emit({ type: 'stateChange', state: this.state });
    }
  }

  async unpauseSession(): Promise<void> {
    if (this.state && !this.state.isActive && this.profile) {
      // Adjust startTime to account for the time spent paused
      // New StartTime = CurrentTime - ElapsedTime
      const now = Date.now();
      this.state.startTime = now - (this.state.elapsedTime * 1000);
      this.state.isActive = true;
      delete this.state.pausedAt;

      await StorageService.saveSessionState(this.state);

      // Restart native foreground service on Android
      if (this.useNativeService) {
        await PomodoroService.startSession({
          workDurationMin: this.profile.workDuration / 60,
          breakDurationMin: this.profile.breakDuration / 60,
          totalRounds: this.state.totalRounds,
          profileId: this.profile.id,
          currentRound: this.state.currentRound,
          isWorkPhase: this.state.isWorkPhase,
          phaseStartTimeMillis: this.state.startTime,
          phaseDurationSec: this.state.phaseDuration,
          activityTag: this.state.currentActivityTag,
        }).catch(() => { });
      }

      this.startTimer();
      this.startOngoingNotification();
      this.emit({ type: 'stateChange', state: this.state });
    }
  }

  async stopSession(): Promise<void> {
    // Stop native foreground service on Android
    if (this.useNativeService) {
      await PomodoroService.stopSession().catch(() => { });
    }

    this.stopTimer();
    this.stopOngoingNotification();
    await NotificationService.clearOngoingNotification();
    await StorageService.clearSessionState();
    this.state = null;
    this.profile = null;
    this.emit({ type: 'stateChange', state: null });
  }

  setActivityTag(tag?: string): void {
    if (this.state) {
      this.state.currentActivityTag = tag;
      StorageService.saveSessionState(this.state);
      // Update the native service with the new tag
      if (this.useNativeService && this.profile) {
        PomodoroService.startSession({
          workDurationMin: this.profile.workDuration / 60,
          breakDurationMin: this.profile.breakDuration / 60,
          totalRounds: this.state.totalRounds,
          profileId: this.profile.id,
          currentRound: this.state.currentRound,
          isWorkPhase: this.state.isWorkPhase,
          phaseStartTimeMillis: this.state.startTime,
          phaseDurationSec: this.state.phaseDuration,
          activityTag: tag,
        }).catch(() => { });
      }
      this.emit({ type: 'stateChange', state: this.state });
    }
  }

  /**
   * Turn the upcoming (or current) break into work time for this round.
   * - During work: adds break duration to current phase and skips break when phase ends.
   * - During break: ends break now and starts work with (full work + remaining break time).
   */
  async convertBreakToWork(): Promise<void> {
    if (!this.state || !this.profile || !this.state.isActive || this.profile.breakDuration === 0) return;

    if (this.state.isWorkPhase) {
      // Add break duration to current work phase and skip break when this phase ends
      this.state.phaseDuration += this.profile.breakDuration;
      this.state.skipBreakThisRound = true;
    } else {
      // Currently on break: switch to work with full work duration + remaining break time
      const remainingBreakSec = Math.max(0, this.state.phaseDuration - this.state.elapsedTime);
      this.state.isWorkPhase = true;
      this.state.phaseDuration = this.profile.workDuration + remainingBreakSec;
      this.state.elapsedTime = 0;
      this.state.startTime = Date.now();
      this.state.skipBreakThisRound = true;
    }

    await StorageService.saveSessionState(this.state);

    if (this.useNativeService) {
      await PomodoroService.startSession({
        workDurationMin: this.profile.workDuration / 60,
        breakDurationMin: this.profile.breakDuration / 60,
        totalRounds: this.state.totalRounds,
        profileId: this.profile.id,
        currentRound: this.state.currentRound,
        isWorkPhase: this.state.isWorkPhase,
        phaseStartTimeMillis: this.state.startTime,
        phaseDurationSec: this.state.phaseDuration,
        activityTag: this.state.currentActivityTag,
      }).catch(() => {});
    }

    this.emit({ type: 'stateChange', state: this.state });
  }

  async suspendRound(): Promise<void> {
    if (this.state && this.state.isActive && this.state.isWorkPhase && this.state.currentActivityTag) {
      const remaining = this.getTimeRemaining();
      const suspendedRound: SuspendedRound = {
        id: Date.now().toString(),
        profileId: this.state.profileId,
        activityTag: this.state.currentActivityTag,
        timeRemaining: remaining,
        phaseDuration: this.state.phaseDuration,
        createdAt: new Date().toISOString(),
      };

      await StorageService.addSuspendedRound(suspendedRound);

      // Reset current phase timer for the "new round"
      this.state.elapsedTime = 0;
      this.state.startTime = Date.now();
      if (this.profile) {
        this.state.phaseDuration = this.profile.workDuration; // Now in seconds
      }

      await StorageService.saveSessionState(this.state);
      this.emit({ type: 'stateChange', state: this.state });
    }
  }

  async switchActivityWithSuspension(newTag: string, suspend: boolean): Promise<void> {
    if (!this.state || !this.profile) return;

    if (suspend && this.state.isActive && this.state.isWorkPhase && this.state.currentActivityTag) {
      await this.suspendRound();
    }

    this.state.currentActivityTag = newTag;
    await StorageService.saveSessionState(this.state);

    if (this.useNativeService) {
      await PomodoroService.startSession({
        workDurationMin: this.profile.workDuration / 60,
        breakDurationMin: this.profile.breakDuration / 60,
        totalRounds: this.state.totalRounds,
        profileId: this.profile.id,
        currentRound: this.state.currentRound,
        isWorkPhase: this.state.isWorkPhase,
        phaseStartTimeMillis: this.state.startTime,
        phaseDurationSec: this.state.phaseDuration,
        activityTag: newTag || undefined,
      }).catch(() => { });
    }

    this.emit({ type: 'stateChange', state: this.state });
  }

  async resumeSuspendedRound(suspendedRound: SuspendedRound): Promise<void> {
    if (this.state && this.profile) {
      this.state.currentActivityTag = suspendedRound.activityTag;
      this.state.phaseDuration = suspendedRound.phaseDuration;
      this.state.elapsedTime = 0;
      this.state.startTime = Date.now() - ((suspendedRound.phaseDuration - suspendedRound.timeRemaining) * 1000);
      this.state.isActive = true;
      delete this.state.pausedAt;

      await StorageService.saveSessionState(this.state);
      await StorageService.removeSuspendedRound(suspendedRound.id);

      if (this.useNativeService) {
        await PomodoroService.startSession({
          workDurationMin: this.profile.workDuration / 60,
          breakDurationMin: this.profile.breakDuration / 60,
          totalRounds: this.state.totalRounds,
          profileId: this.profile.id,
          currentRound: this.state.currentRound,
          isWorkPhase: this.state.isWorkPhase,
          phaseStartTimeMillis: this.state.startTime,
          phaseDurationSec: this.state.phaseDuration,
          activityTag: this.state.currentActivityTag,
        }).catch(() => { });
      }

      this.startTimer();
      this.startOngoingNotification();
      this.emit({ type: 'stateChange', state: this.state });
    }
  }

  private startTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = window.setInterval(() => {
      if (!this.state || !this.profile) return;

      // Use wall-clock time to prevent drift/freezing in background
      const now = Date.now();
      const newElapsed = Math.floor((now - this.state.startTime) / 1000);

      // Ensure we don't go backwards (if clock skews) and update state
      if (newElapsed > this.state.elapsedTime) {
        this.state.elapsedTime = newElapsed;
      }


      if (this.state.elapsedTime >= this.state.phaseDuration) {
        this.handlePhaseEnd();
      } else {
        StorageService.saveSessionState(this.state);
        // Explicitly emit stateChange toggle if needed, or just tick
        this.emit({ type: 'tick', state: this.state });
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private startOngoingNotification() {
    if (this.ongoingNotificationInterval) {
      clearInterval(this.ongoingNotificationInterval);
    }

    // Update notification every second for accurate countdown
    // Note: This will cause the notification to refresh frequently
    // For less flicker but less accuracy, increase the interval
    this.ongoingNotificationInterval = window.setInterval(() => {
      if (this.state && this.state.isActive) {
        const remaining = this.getTimeRemaining();
        NotificationService.showOngoingNotification(
          this.formatTime(remaining),
          this.state.currentRound,
          this.state.totalRounds,
          this.state.isWorkPhase ? 'work' : 'break',
          this.state.currentActivityTag
        );
      }
    }, 1000);

    // Show initial notification
    if (this.state) {
      const remaining = this.getTimeRemaining();
      NotificationService.showOngoingNotification(
        this.formatTime(remaining),
        this.state.currentRound,
        this.state.totalRounds,
        this.state.isWorkPhase ? 'work' : 'break',
        this.state.currentActivityTag
      );
    }
  }

  private stopOngoingNotification() {
    if (this.ongoingNotificationInterval) {
      clearInterval(this.ongoingNotificationInterval);
      this.ongoingNotificationInterval = null;
    }
  }

  dispose() {
    this.stopTimer();
    this.stopOngoingNotification();
    this.listeners.clear();
    this.removeNotificationListeners();
    this.removeAppListeners();
  }

  private appListener: any = null;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private syncInProgress = false;

  private async setupAppListeners() {
    this.appListener = await App.addListener('appStateChange', async (state: { isActive: boolean }) => {
      if (state.isActive) {
        // Re-schedule auto-start alarm when app comes to foreground (alarm may have been cleared)
        if (this.useNativeService) {
          this.startSchedulerServiceIfNeeded().catch(() => {});
        }
        // App resumed - force immediate update
        if (this.useNativeService) {
          await this.syncWithNative();
          // Poll native state while in foreground so notification actions (Start/Stop) reflect in UI
          this.clearSyncInterval();
          this.syncIntervalId = setInterval(() => this.syncWithNative(), 1000);
        } else if (this.state && this.state.isActive) {
          // Web wall-clock catch-up
          const now = Date.now();
          const newElapsed = Math.floor((now - this.state.startTime) / 1000);

          if (newElapsed > this.state.elapsedTime) {
            this.state.elapsedTime = newElapsed;
          }

          // Check for phase end immediately
          if (this.state.elapsedTime >= this.state.phaseDuration) {
            this.handlePhaseEnd();
          } else {
            this.startTimer();
            this.startOngoingNotification();
            this.emit({ type: 'tick', state: this.state });
          }
        }
      } else {
        // App backgrounded - STOP JS logic to avoid conflicts with native service
        console.log('App backgrounded - stopping JS timers');
        this.clearSyncInterval();
        this.stopTimer();
        this.stopOngoingNotification();
        if (this.state) {
          const stateToSave = { ...this.state }; // Create a copy to modify
          if (stateToSave.isActive && !this.useNativeService) {
            // On web: do NOT persist isActive: false when backgrounded (e.g. tab blur/refresh).
            // Keep session resumable so that after a page refresh we can resume from storage.
            // Only update elapsed time so the snapshot is accurate when we resume.
            const now = Date.now();
            stateToSave.elapsedTime = Math.floor((now - stateToSave.startTime) / 1000);
            await StorageService.saveSessionState(stateToSave);
          } else if (stateToSave.isActive && this.useNativeService) {
            // For Android, if active, keep isActive true, trust native service
            console.log('Native service session backgrounded: isActive remains true');
            await StorageService.saveSessionState(stateToSave);
          } else {
            // If already inactive or paused, save as is.
            console.log('Session already inactive/paused, saving as is.');
            await StorageService.saveSessionState(stateToSave);
          }
        }
      }
    });
  }

  private async syncWithNative() {
    if (!this.useNativeService) return;
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    try {
      const nativeState = await PomodoroService.getSessionState();
      console.log('Syncing with native state:', nativeState);

      if (nativeState.isActive) {
        // Native is the source of truth
        const phaseDurationSec = nativeState.phaseDurationSec ?? 0;
        const timeRemainingSec = nativeState.timeRemainingSec ?? 0;
        const elapsedTime = Math.max(0, phaseDurationSec - timeRemainingSec);
        const phaseEndTimeMillis = nativeState.phaseEndTimeMillis ?? Date.now();
        const startTime = phaseEndTimeMillis - phaseDurationSec * 1000;
        const profileId = nativeState.profileId || this.state?.profileId || '';

        this.state = {
          ...this.state,
          profileId,
          currentRound: nativeState.currentRound ?? 1,
          totalRounds: nativeState.totalRounds ?? this.state?.totalRounds ?? 0,
          isWorkPhase: nativeState.isWorkPhase ?? true,
          startTime,
          sessionStartTime: this.state?.sessionStartTime ?? startTime, // Preserve session start time
          elapsedTime,
          phaseDuration: phaseDurationSec,
          isActive: true,
          currentActivityTag: nativeState.activityTag || this.state?.currentActivityTag,
        };

        // Keep controller profile in sync so UI shows the correct profile (e.g. after "Start now" from notification)
        const profiles = await StorageService.getProfiles();
        this.profile = profiles.find(p => p.id === profileId) || this.profile;

        // Resume JS UI updates
        this.startTimer();
        this.startOngoingNotification();
        this.emit({ type: 'stateChange', state: this.state });

        // Save any rounds that completed while app was in background
        await this.processPendingLogsFromNative(nativeState);
      } else if (nativeState.sessionEndedNaturally) {
        // Native completed all rounds while app was in background. End session on JS;
        // do NOT restart native or we would effectively "start a new session" from stale state.
        await this.processPendingLogsFromNative(nativeState);
        if (this.state) {
          this.emit({ type: 'sessionEnd', state: this.state });
        }
        await this.stopSession();
      } else if (nativeState.stoppedByUser) {
        // User tapped Stop on the notification – end session on JS, don't restart native.
        if (this.state) {
          this.emit({ type: 'sessionEnd', state: this.state });
        }
        await this.stopSession();
      } else if (this.state && this.state.isActive) {
        // Native says not active (e.g. process was killed) but we have an active session.
        // Session must ONLY end when the user explicitly ends it - never on app close/background.
        // Keep the session and restart the native service so the timer continues.
        console.log('Native session not active but we have active session - restarting native service');
        await StorageService.saveSessionState(this.state);
        if (!this.profile) {
          const profiles = await StorageService.getProfiles();
          this.profile = profiles.find(p => p.id === this.state!.profileId) || null;
        }
        if (this.profile) {
          await PomodoroService.startSession({
            workDurationMin: this.profile.workDuration / 60,
            breakDurationMin: this.profile.breakDuration / 60,
            totalRounds: this.state!.totalRounds,
            profileId: this.profile.id,
            currentRound: this.state!.currentRound,
            isWorkPhase: this.state!.isWorkPhase,
            phaseStartTimeMillis: this.state!.startTime,
            phaseDurationSec: this.state!.phaseDuration,
            activityTag: this.state!.currentActivityTag,
          }).catch(() => {});
        }
        this.startTimer();
        this.startOngoingNotification();
        this.emit({ type: 'stateChange', state: this.state });
      }
    } catch (e) {
      console.error('Error syncing with native service:', e);
    } finally {
      this.syncInProgress = false;
    }
  }

  private clearSyncInterval() {
    if (this.syncIntervalId != null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Start polling native state when app is in foreground (Android). Call from UI init so the
   * screen updates when the user taps Start/Stop on the notification without leaving the app.
   */
  async ensureForegroundPolling(): Promise<void> {
    if (!this.useNativeService || this.syncIntervalId != null) return;
    try {
      const state = await App.getState();
      if (state.isActive) {
        await this.syncWithNative();
        this.syncIntervalId = setInterval(() => this.syncWithNative(), 1000);
      }
    } catch {
      // ignore
    }
  }

  private removeAppListeners() {
    this.clearSyncInterval();
    if (this.appListener) {
      this.appListener.remove();
      this.appListener = null;
    }
  }

  /**
   * Persist all completed phases from native (rounds that finished while app was in background).
   * Uses current this.state for profileId and sessionStartTime. Call before clearing state.
   */
  async processPendingLogsFromNative(nativeState: PomodoroSessionState): Promise<void> {
    const list = nativeState.pendingLogs?.length
      ? nativeState.pendingLogs
      : nativeState.pendingLog
        ? [{
            roundNumber: nativeState.pendingLog.roundNumber,
            phaseType: nativeState.pendingLog.phaseType,
            phaseEndTimeMillis: Date.now(),
            activityTag: nativeState.activityTag,
          }]
        : [];
    if (list.length === 0) return;

    const profileId = this.state?.profileId ?? nativeState.profileId ?? '';
    const sessionStartTime = this.state?.sessionStartTime ?? nativeState.sessionStartTime ?? Date.now();
    const sessionStartTimeISO = new Date(sessionStartTime).toISOString();
    const totalRounds = this.state?.totalRounds ?? nativeState.totalRounds ?? 0;
    const toShow: PendingLogToShow[] = [];

    // Native adds one pending log per phase (work + break). We only want one log per round to match
    // foreground behavior: log the work phase as the round completion. Skip break-phase entries.
    const roundEntries = list.filter((e: { phaseType?: string }) => e.phaseType === 'work');

    for (let i = 0; i < roundEntries.length; i++) {
      const entry = roundEntries[i];
      const logId = `${sessionStartTime}-${entry.roundNumber}-work-${i}-${Date.now()}`;
      const log: SessionLog = {
        id: logId,
        profileId,
        sessionStartTime: sessionStartTimeISO,
        roundNumber: entry.roundNumber,
        phaseType: 'work',
        phaseEndTime: entry.phaseEndTimeMillis
          ? new Date(entry.phaseEndTimeMillis).toISOString()
          : new Date().toISOString(),
        notes: '',
        answers: {},
        activityTag: entry.activityTag,
      };
      await StorageService.addSessionLog(log);
      toShow.push({
        logId,
        roundNumber: entry.roundNumber,
        phaseType: 'work' as const,
        activityTag: entry.activityTag,
        profileId,
        sessionStartTime: sessionStartTimeISO,
        totalRounds,
      });
    }
    await PomodoroService.clearPendingLog();
    this.emit({ type: 'logsUpdated', state: this.state });
    if (toShow.length > 0) {
      this.emit({ type: 'pendingLogsToShow', state: this.state, pendingLogsToShow: toShow });
    }
  }

  private isHandlingPhaseEnd = false;

  private async handlePhaseEnd() {
    if (!this.state || !this.profile || this.isHandlingPhaseEnd) return;
    this.isHandlingPhaseEnd = true;

    let shouldEmitPhaseEndForLogging = false;
    let stateToEmitForLogging: SessionState | null = null;

    try {
      // Vibrate to signal phase end (only if not handled by native service)
      if (!this.useNativeService) {
        await NotificationService.vibratePattern();
      }

      // Show notification
      await NotificationService.schedulePhaseEndNotification(
        this.state.isWorkPhase ? 'work' : 'break',
        this.state.currentRound,
        this.state.totalRounds,
        this.state.currentActivityTag
      );

      // --- Logic to handle phase transition and determine when to log a full round ---
      if (this.state.isWorkPhase) {
        // Work phase ended
        this.lastCompletedWorkPhaseState = { ...this.state }; // Capture current state for logging later

        const skipBreak = this.state.skipBreakThisRound === true;
        if (skipBreak) {
          this.state.skipBreakThisRound = false;
        }

        if (this.profile.breakDuration === 0 || skipBreak) {
          // No break (or user chose to skip break): Round is complete, log the work phase immediately
          shouldEmitPhaseEndForLogging = true;
          stateToEmitForLogging = this.lastCompletedWorkPhaseState;

          // Transition to next round or end session
          if (this.state.currentRound >= this.state.totalRounds) {
            this.emit({ type: 'sessionEnd', state: this.state });
            await this.stopSession();
            return;
          } else {
            this.state.currentRound++;
            this.state.isWorkPhase = true;
            this.state.phaseDuration = this.profile.workDuration; // Now in seconds
            this.state.elapsedTime = 0;
            this.state.startTime = Date.now();
            // Keep native service in sync when we skipped break (JS transitioned to next round; native would have gone to break)
            if (skipBreak && this.useNativeService && this.profile) {
              await PomodoroService.startSession({
                workDurationMin: this.profile.workDuration / 60,
                breakDurationMin: this.profile.breakDuration / 60,
                totalRounds: this.state.totalRounds,
                profileId: this.profile.id,
                currentRound: this.state.currentRound,
                isWorkPhase: this.state.isWorkPhase,
                phaseStartTimeMillis: this.state.startTime,
                phaseDurationSec: this.state.phaseDuration,
                activityTag: this.state.currentActivityTag,
              }).catch(() => {});
            }
          }
        } else {
          // Break phase starts
          this.state.isWorkPhase = false;
          this.state.phaseDuration = this.profile.breakDuration; // Now in seconds
          this.state.elapsedTime = 0;
          this.state.startTime = Date.now();
        }
      } else {
        // Break phase ended: Round is fully complete, log the previously captured work phase
        shouldEmitPhaseEndForLogging = true;
        stateToEmitForLogging = this.lastCompletedWorkPhaseState;
        this.lastCompletedWorkPhaseState = null; // Clear after use

        // Transition to next round or end session
        if (this.state.currentRound >= this.state.totalRounds) {
          this.emit({ type: 'sessionEnd', state: this.state });
          await this.stopSession();
          return;
        } else {
          this.state.currentRound++;
          this.state.isWorkPhase = true;
          this.state.phaseDuration = this.profile.workDuration; // Now in seconds
          this.state.elapsedTime = 0;
          this.state.startTime = Date.now();
        }
      }
      // --- End of phase transition logic ---

      await StorageService.saveSessionState(this.state);
      this.emit({ type: 'stateChange', state: this.state });
      this.stopOngoingNotification();
      this.startOngoingNotification();

      // Emit phaseEnd event ONLY when a full round is complete and logging is due
      if (shouldEmitPhaseEndForLogging && stateToEmitForLogging) {
          this.emit({ type: 'phaseEnd', state: stateToEmitForLogging });
      }

    } finally {
      this.isHandlingPhaseEnd = false;
    }
  }

  getTimeRemaining(): number {
    if (!this.state) return 0;
    return Math.max(0, this.state.phaseDuration - this.state.elapsedTime);
  }

  getCurrentState(): SessionState | null {
    return this.state;
  }

  getCurrentProfile(): Profile | null {
    return this.profile;
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Start or stop the Android scheduler foreground service based on the currently selected profile.
   * When the active profile has autoStartTime, starts the service (shows "Session starting at HH:MM").
   * Otherwise stops it.
   */
  async startSchedulerServiceIfNeeded(): Promise<void> {
    if (!this.useNativeService) return;

    const profile = await StorageService.getActiveProfile();
    if (!profile.autoStartTime) {
      try {
        await PomodoroService.stopSchedulerService();
      } catch (e) {
        console.warn('Failed to stop scheduler service:', e);
      }
      return;
    }

    const [hourStr, minStr] = profile.autoStartTime.split(':');
    const hour = parseInt(hourStr || '0', 10);
    const minute = parseInt(minStr || '0', 10);

    try {
      await PomodoroService.startSchedulerService({
        hour,
        minute,
        workDurationMin: profile.workDuration / 60,
        breakDurationMin: profile.breakDuration / 60,
        totalRounds: profile.rounds,
        profileId: profile.id,
        activityTag: undefined,
      });
    } catch (e) {
      console.warn('Failed to start scheduler service:', e);
    }
  }
}
