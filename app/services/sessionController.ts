import type { Profile, SessionState } from '../types/pomodoro';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import PomodoroService from './pomodoroService';
import { StorageService } from './storage';
import { NotificationService } from './notifications';

export type SessionEventType = 'tick' | 'phaseEnd' | 'sessionEnd' | 'stateChange';

export interface SessionEvent {
  type: SessionEventType;
  state: SessionState;
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
    this.listeners.forEach(listener => listener(event));
  }

  async startSession(profile: Profile, activityTag?: string): Promise<void> {
    this.profile = profile;

    const now = new Date();
    const nowMinutes =
      now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    const workMinutes = profile.workDuration;
    const breakMinutes = profile.breakDuration;
    const roundLengthMinutes = workMinutes + breakMinutes;

    let totalRounds = profile.rounds;
    let isWorkPhase = true;
    let phaseDurationSec = workMinutes * 60;
    let phaseStartTimeMillis = Date.now();
    let elapsedTimeSec = 0;

    // When a profile is configured to use an end time, calculate how many
    // rounds fit between "now" and that end time, and if we're in the
    // middle of a round, start with a shortened first round instead of
    // a shortened last round.
    if (
      profile.useEndTime &&
      profile.endTime &&
      roundLengthMinutes > 0
    ) {
      const [endHourStr, endMinStr] = profile.endTime.split(':');
      const endHour = parseInt(endHourStr || '0', 10);
      const endMinute = parseInt(endMinStr || '0', 10);
      const endMinutes = endHour * 60 + endMinute;

      const minutesUntilEnd = endMinutes - nowMinutes;

      if (minutesUntilEnd > 0) {
        const rawRounds = minutesUntilEnd / roundLengthMinutes;
        const computedRounds = Math.ceil(rawRounds);

        if (computedRounds >= 1) {
          totalRounds = computedRounds;

          // Total remaining time in the first (possibly shortened) round
          const remainingFirstRoundMinutes =
            minutesUntilEnd - (computedRounds - 1) * roundLengthMinutes;

          // Offset into the conceptual round where we are starting
          const offsetWithinRoundMinutes =
            roundLengthMinutes - remainingFirstRoundMinutes;

          // Determine current phase and how far into it we are
          if (offsetWithinRoundMinutes < workMinutes && workMinutes > 0) {
            // In work phase
            isWorkPhase = true;
            const offsetWithinWorkMinutes = Math.max(
              0,
              Math.min(offsetWithinRoundMinutes, workMinutes)
            );
            // For a shortened first phase, calculate the actual remaining time
            const remainingWorkMinutes = workMinutes - offsetWithinWorkMinutes;
            phaseDurationSec = Math.round(remainingWorkMinutes * 60);
            elapsedTimeSec = 0;  // Start from 0 since we're setting duration to remaining time
            phaseStartTimeMillis = Date.now();
          } else if (breakMinutes > 0) {
            // In break phase
            isWorkPhase = false;
            const offsetWithinBreakMinutes = Math.max(
              0,
              Math.min(
                offsetWithinRoundMinutes - workMinutes,
                breakMinutes
              )
            );
            // For a shortened first phase, calculate the actual remaining time
            const remainingBreakMinutes = breakMinutes - offsetWithinBreakMinutes;
            phaseDurationSec = Math.round(remainingBreakMinutes * 60);
            elapsedTimeSec = 0;  // Start from 0 since we're setting duration to remaining time
            phaseStartTimeMillis = Date.now();
          } else {
            // Edge case: work is 0 or we're past both phases somehow
            // Default to work phase with no time elapsed
            isWorkPhase = true;
            phaseDurationSec = workMinutes * 60;
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
      elapsedTime: elapsedTimeSec,
      phaseDuration: phaseDurationSec,
      isActive: true,
      currentActivityTag: activityTag,
    };

    await StorageService.saveSessionState(this.state);
    await NotificationService.initialize();

    // Start native foreground service on Android so the notification
    // countdown keeps running even if the JS runtime is killed.
    if (this.useNativeService) {
      await PomodoroService.startSession({
        workDurationMin: profile.workDuration,
        breakDurationMin: profile.breakDuration,
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
          elapsedTime,
          phaseDuration: phaseDurationSec,
          isActive: true,
          currentActivityTag: nativeState.activityTag,
        };

        await NotificationService.initialize();
        this.startTimer();
        this.startOngoingNotification();
        this.emit({ type: 'stateChange', state: this.state });
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
    };

    await NotificationService.initialize();
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
  }

  setActivityTag(tag?: string): void {
    if (this.state) {
      this.state.currentActivityTag = tag;
      StorageService.saveSessionState(this.state);
      // Update the native service with the new tag
      if (this.useNativeService && this.profile) {
        PomodoroService.startSession({
          workDurationMin: this.profile.workDuration,
          breakDurationMin: this.profile.breakDuration,
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

  private async setupAppListeners() {
    this.appListener = await App.addListener('appStateChange', (state: { isActive: boolean }) => {
      if (state.isActive) {
        // App resumed - force immediate update
        if (this.state && this.state.isActive) {
          const now = Date.now();
          const newElapsed = Math.floor((now - this.state.startTime) / 1000);

          if (newElapsed > this.state.elapsedTime) {
            this.state.elapsedTime = newElapsed;
          }

          // Check for phase end immediately
          if (this.state.elapsedTime >= this.state.phaseDuration) {
            this.handlePhaseEnd();
          } else {
            this.emit({ type: 'tick', state: this.state });
          }
        }
      }
    });
  }

  private removeAppListeners() {
    if (this.appListener) {
      this.appListener.remove();
      this.appListener = null;
    }
  }

  private isHandlingPhaseEnd = false;

  private async handlePhaseEnd() {
    if (!this.state || !this.profile || this.isHandlingPhaseEnd) return;
    this.isHandlingPhaseEnd = true;

    try {
      // Vibrate to signal phase end
      await NotificationService.vibratePattern();

      // Show notification
      await NotificationService.schedulePhaseEndNotification(
        this.state.isWorkPhase ? 'work' : 'break',
        this.state.currentRound,
        this.state.totalRounds,
        this.state.currentActivityTag
      );

      // Emit phase end event BEFORE updating state (UI will handle showing log dialog)
      // This ensures the logging modal receives the correct completed round number
      this.emit({ type: 'phaseEnd', state: this.state });

      // Move to next phase
      if (this.state.isWorkPhase) {
        // Work phase ended
        if (this.profile.breakDuration === 0) {
          // No break, move directly to next round
          if (this.state.currentRound >= this.state.totalRounds) {
            // Session complete
            this.emit({ type: 'sessionEnd', state: this.state });
            await this.stopSession();
            return;
          } else {
            // Start next round immediately
            this.state.currentRound++;
            this.state.isWorkPhase = true;
            this.state.phaseDuration = this.profile.workDuration * 60;
            this.state.elapsedTime = 0;
            this.state.startTime = Date.now();
          }
        } else {
          // Start break phase
          this.state.isWorkPhase = false;
          this.state.phaseDuration = this.profile.breakDuration * 60;
          this.state.elapsedTime = 0;
          this.state.startTime = Date.now();
        }
      } else {
        // Break phase ended, move to next round or end session
        if (this.state.currentRound >= this.state.totalRounds) {
          // Session complete
          this.emit({ type: 'sessionEnd', state: this.state });
          await this.stopSession();
          return;
        } else {
          // Start next round
          this.state.currentRound++;
          this.state.isWorkPhase = true;
          this.state.phaseDuration = this.profile.workDuration * 60;
          this.state.elapsedTime = 0;
          this.state.startTime = Date.now();
        }
      }

      await StorageService.saveSessionState(this.state);
      this.emit({ type: 'stateChange', state: this.state });
      this.stopOngoingNotification();
      this.startOngoingNotification();
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
}
