import type { Profile, SessionState, SessionLog } from '../types/pomodoro';
import { StorageService } from './storage';
import { NotificationService } from './notifications';

export type SessionEventType = 'tick' | 'phaseEnd' | 'sessionEnd' | 'stateChange';

export interface SessionEvent {
  type: SessionEventType;
  state: SessionState;
}

export class SessionController {
  private state: SessionState | null = null;
  private profile: Profile | null = null;
  private intervalId: number | null = null;
  private listeners: Set<(event: SessionEvent) => void> = new Set();
  private ongoingNotificationInterval: number | null = null;

  constructor() {
    this.setupNotificationListeners();
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
    return () => this.listeners.delete(listener);
  }

  private emit(event: SessionEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  async startSession(profile: Profile): Promise<void> {
    this.profile = profile;
    this.state = {
      profileId: profile.id,
      currentRound: 1,
      totalRounds: profile.rounds,
      isWorkPhase: true,
      startTime: Date.now(),
      elapsedTime: 0,
      phaseDuration: profile.workDuration * 60, // Convert to seconds
      isActive: true,
    };

    await StorageService.saveSessionState(this.state);
    await NotificationService.initialize();
    this.startTimer();
    this.startOngoingNotification();
    this.emit({ type: 'stateChange', state: this.state });
  }

  async resumeSession(): Promise<boolean> {
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
      StorageService.saveSessionState(this.state);
      this.emit({ type: 'stateChange', state: this.state });
    }
  }

  async stopSession(): Promise<void> {
    this.stopTimer();
    this.stopOngoingNotification();
    await NotificationService.clearOngoingNotification();
    await StorageService.clearSessionState();
    this.state = null;
    this.profile = null;
  }

  private startTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = window.setInterval(() => {
      if (!this.state || !this.profile) return;

      this.state.elapsedTime++;

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
          this.state.isWorkPhase ? 'work' : 'break'
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
        this.state.isWorkPhase ? 'work' : 'break'
      );
    }
  }

  private stopOngoingNotification() {
    if (this.ongoingNotificationInterval) {
      clearInterval(this.ongoingNotificationInterval);
      this.ongoingNotificationInterval = null;
    }
  }

  private async handlePhaseEnd() {
    if (!this.state || !this.profile) return;

    // Vibrate to signal phase end
    await NotificationService.vibratePattern();

    // Show notification
    await NotificationService.schedulePhaseEndNotification(
      this.state.isWorkPhase ? 'work' : 'break',
      this.state.currentRound,
      this.state.totalRounds
    );

    // Emit phase end event (UI will handle showing log dialog)
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
