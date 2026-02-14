import { registerPlugin } from '@capacitor/core';

export interface PomodoroSessionState {
  isActive: boolean;
  /** True when the native service stopped because all rounds completed (not user stop). */
  sessionEndedNaturally?: boolean;
  /** True when the user tapped Stop on the notification. */
  stoppedByUser?: boolean;
  profileId?: string;
  totalRounds?: number;
  currentRound?: number;
  isWorkPhase?: boolean;
  phaseEndTimeMillis?: number;
  timeRemainingSec?: number;
  phaseDurationSec?: number;
  activityTag?: string;
  sessionStartTime?: number;
  /** Single log (legacy); prefer pendingLogs when multiple rounds complete in background. */
  pendingLog?: {
    roundNumber: number;
    phaseType: string;
  };
  /** Queue of completed phases to save (native fills this when phases complete in background). */
  pendingLogs?: Array<{
    roundNumber: number;
    phaseType: string;
    phaseEndTimeMillis?: number;
    activityTag?: string;
  }>;
}

export interface PomodoroServicePlugin {
  startSession(options: {
    workDurationMin: number;
    breakDurationMin: number;
    totalRounds: number;
    profileId: string;
    currentRound?: number;
    isWorkPhase?: boolean;
    phaseStartTimeMillis?: number;
    phaseDurationSec?: number;
    activityTag?: string;
  }): Promise<void>;

  stopSession(): Promise<void>;

  getSessionState(): Promise<PomodoroSessionState>;

  clearPendingLog(): Promise<void>;

  cancelPhaseCompleteNotification(options: { roundNumber: number }): Promise<void>;

  /** Start the scheduler foreground service (Android). Shows "Session starting at HH:MM" and starts the session at that time. */
  startSchedulerService(options: {
    hour: number;
    minute: number;
    workDurationMin: number;
    breakDurationMin: number;
    totalRounds: number;
    profileId: string;
    activityTag?: string;
  }): Promise<void>;

  /** Stop the scheduler service (Android). */
  stopSchedulerService(): Promise<void>;
}

const PomodoroService = registerPlugin<PomodoroServicePlugin>('PomodoroService', {
  web: () => ({
    async startSession() {},
    async stopSession() {},
    async getSessionState() {
      return { isActive: false };
    },
    async clearPendingLog() {},
    async cancelPhaseCompleteNotification() {},
    async startSchedulerService() {},
    async stopSchedulerService() {},
  }),
});

export default PomodoroService;
