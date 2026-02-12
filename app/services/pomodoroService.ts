import { registerPlugin } from '@capacitor/core';

export interface PomodoroSessionState {
  isActive: boolean;
  profileId?: string;
  totalRounds?: number;
  currentRound?: number;
  isWorkPhase?: boolean;
  phaseEndTimeMillis?: number;
  timeRemainingSec?: number;
  phaseDurationSec?: number;
  pendingLog?: {
    roundNumber: number;
    phaseType: string;
  };
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
  }): Promise<void>;

  stopSession(): Promise<void>;

  getSessionState(): Promise<PomodoroSessionState>;

  clearPendingLog(): Promise<void>;
}

const PomodoroService = registerPlugin<PomodoroServicePlugin>('PomodoroService', {
  web: () => ({
    async startSession() {},
    async stopSession() {},
    async getSessionState() {
      return { isActive: false };
    },
    async clearPendingLog() {},
  }),
});

export default PomodoroService;
