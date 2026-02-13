// Core types for the Pomodoro Plus application

export interface Profile {
  id: string;
  name: string;
  rounds: number;
  workDuration: number; // in minutes
  breakDuration: number; // in minutes
  /**
   * When true, this profile uses a clock end time instead of a fixed
   * number of rounds. The actual number of rounds is calculated when
   * the user taps "Start", based on the current time, the configured
   * end time, and the round length (work + break).
   */
  useEndTime?: boolean;
  /**
   * Local clock time (24h) at which the session should end when
   * `useEndTime` is enabled, formatted as "HH:MM" (e.g. "18:00").
   */
  endTime?: string;
  /**
   * List of activity tags that can be assigned to rounds
   * (e.g., "Coding", "Reading", "Meeting")
   */
  activityTags?: string[];
  /**
   * Key is the tag name, value is the target number of rounds.
   */
  goals?: Record<string, number | string>;
  /**
   * Colors for activity tags.
   * Key is the tag name, value is a CSS color string.
   */
  tagColors?: Record<string, string>;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
  autoStartTime?: string; // "HH:MM"
  lastAutoStartDay?: string; // "YYYY-MM-DD"
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
  startTime: number; // timestamp of current phase start
  sessionStartTime: number; // timestamp of when the entire session started
  pausedAt?: number; // timestamp if paused
  elapsedTime: number; // in seconds
  phaseDuration: number; // in seconds
  isActive: boolean;
  currentActivityTag?: string; // Current activity tag for this round
  timeRemaining?: number; // Optional: used when resuming a suspended round
}

export interface SuspendedRound {
  id: string;
  profileId: string;
  activityTag: string;
  timeRemaining: number;
  phaseDuration: number;
  createdAt: string;
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
  activityTag?: string; // Activity tag for this round
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
  activityTags: ['Coding', 'Reading', 'Writing', 'Meeting', 'Planning'],
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
  updatedAt: new Date().toISOString(),
  autoStartTime: undefined,
  lastAutoStartDay: undefined
};
