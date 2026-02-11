// Core types for the Pomodoro Plus application

export interface Profile {
  id: string;
  name: string;
  rounds: number;
  workDuration: number; // in minutes
  breakDuration: number; // in minutes
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  text: string;
  type: 'work' | 'break' | 'both'; // When to show the question
  options: string[]; // Multiple choice options
}

export interface SessionState {
  profileId: string;
  currentRound: number;
  totalRounds: number;
  isWorkPhase: boolean;
  startTime: number; // timestamp
  pausedAt?: number; // timestamp if paused
  elapsedTime: number; // in seconds
  phaseDuration: number; // in seconds
  isActive: boolean;
}

export interface SessionLog {
  id: string;
  profileId: string;
  sessionStartTime: string;
  roundNumber: number;
  phaseType: 'work' | 'break';
  phaseEndTime: string;
  notes: string;
  answers: Record<string, string>; // questionId -> answer
}

export interface SessionSummary {
  id: string;
  profileId: string;
  startTime: string;
  endTime: string;
  completedRounds: number;
  totalRounds: number;
  logs: SessionLog[];
}

export const DEFAULT_PROFILE: Profile = {
  id: 'default',
  name: 'Default',
  rounds: 16,
  workDuration: 50,
  breakDuration: 10,
  questions: [
    {
      id: 'q1',
      text: 'How focused were you?',
      type: 'work',
      options: ['Very Focused', 'Moderately Focused', 'Not Focused']
    },
    {
      id: 'q2',
      text: 'How rested do you feel?',
      type: 'break',
      options: ['Very Rested', 'Somewhat Rested', 'Not Rested']
    },
    {
      id: 'q3',
      text: 'Energy level?',
      type: 'both',
      options: ['High', 'Medium', 'Low']
    }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};
