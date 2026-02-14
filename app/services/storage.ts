import { Preferences } from '@capacitor/preferences';
import type { Profile, SessionState, SessionLog, SessionSummary, SuspendedRound } from '../types/pomodoro';
import { DEFAULT_PROFILE } from '../types/pomodoro';

const STORAGE_KEYS = {
  PROFILES: 'pomodoro_profiles',
  ACTIVE_PROFILE: 'pomodoro_active_profile',
  SESSION_STATE: 'pomodoro_session_state',
  SESSION_LOGS: 'pomodoro_session_logs',
  SESSION_SUMMARIES: 'pomodoro_session_summaries',
  SUSPENDED_ROUNDS: 'pomodoro_suspended_rounds',
};

export class StorageService {
  // Helper function to migrate old profiles from minutes to seconds (one-time, for pre-refactor data only)
  private static migrateProfileToSeconds(profile: Profile): Profile {
    // Only migrate if this profile was saved BEFORE we added HMS fields (old format = durations in minutes).
    // New saves always include workDurationHrs/Mins/Secs, so undefined means "never written" = old profile.
    const hasHmsFields =
      typeof profile.workDurationHrs === 'number' &&
      typeof profile.workDurationMins === 'number' &&
      typeof profile.workDurationSecs === 'number';
    if (hasHmsFields) {
      return profile; // Already in new format, do not touch
    }

    const workDurationInSeconds = profile.workDuration * 60;
    const breakDurationInSeconds = profile.breakDuration * 60;

    const workHms = this.secondsToHms(workDurationInSeconds);
    const breakHms = this.secondsToHms(breakDurationInSeconds);

    return {
      ...profile,
      workDuration: workDurationInSeconds,
      breakDuration: breakDurationInSeconds,
      workDurationHrs: workHms.hours,
      workDurationMins: workHms.minutes,
      workDurationSecs: workHms.seconds,
      breakDurationHrs: breakHms.hours,
      breakDurationMins: breakHms.minutes,
      breakDurationSecs: breakHms.seconds,
    };
  }
  
  private static secondsToHms(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
  }

  // Profile Management
  static async getProfiles(): Promise<Profile[]> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.PROFILES });
      if (value) {
        const profiles = JSON.parse(value);
        // Migrate profiles if needed
        const migratedProfiles = profiles.map((p: Profile) => this.migrateProfileToSeconds(p));
        
        // Save migrated profiles back if any were changed
        const needsSave = profiles.some((p: Profile, i: number) => 
          p.workDuration !== migratedProfiles[i].workDuration
        );
        if (needsSave) {
          await this.saveProfiles(migratedProfiles);
        }
        
        return migratedProfiles;
      }
      // Initialize with default profile
      const defaultProfiles = [DEFAULT_PROFILE];
      await this.saveProfiles(defaultProfiles);
      return defaultProfiles;
    } catch (error) {
      console.error('Error getting profiles:', error);
      return [DEFAULT_PROFILE];
    }
  }

  static async saveProfiles(profiles: Profile[]): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEYS.PROFILES,
        value: JSON.stringify(profiles),
      });
    } catch (error) {
      console.error('Error saving profiles:', error);
    }
  }

  static async addProfile(profile: Profile): Promise<void> {
    const profiles = await this.getProfiles();
    profiles.push(profile);
    await this.saveProfiles(profiles);
  }

  static async updateProfile(profile: Profile): Promise<void> {
    const profiles = await this.getProfiles();
    const index = profiles.findIndex(p => p.id === profile.id);
    if (index !== -1) {
      profiles[index] = profile;
      await this.saveProfiles(profiles);
    }
  }

  static async deleteProfile(profileId: string): Promise<void> {
    const profiles = await this.getProfiles();
    const filtered = profiles.filter(p => p.id !== profileId);
    await this.saveProfiles(filtered);
  }

  // Active Profile
  static async getActiveProfileId(): Promise<string> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.ACTIVE_PROFILE });
      return value || DEFAULT_PROFILE.id;
    } catch (error) {
      console.error('Error getting active profile:', error);
      return DEFAULT_PROFILE.id;
    }
  }

  static async setActiveProfileId(profileId: string): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEYS.ACTIVE_PROFILE,
        value: profileId,
      });
    } catch (error) {
      console.error('Error setting active profile:', error);
    }
  }

  static async getActiveProfile(): Promise<Profile> {
    const profileId = await this.getActiveProfileId();
    const profiles = await this.getProfiles();
    return profiles.find(p => p.id === profileId) || DEFAULT_PROFILE;
  }

  // Session State Management
  static async getSessionState(): Promise<SessionState | null> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.SESSION_STATE });
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Error getting session state:', error);
      return null;
    }
  }

  static async saveSessionState(state: SessionState): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEYS.SESSION_STATE,
        value: JSON.stringify(state),
      });
    } catch (error) {
      console.error('Error saving session state:', error);
    }
  }

  static async clearSessionState(): Promise<void> {
    try {
      await Preferences.remove({ key: STORAGE_KEYS.SESSION_STATE });
    } catch (error) {
      console.error('Error clearing session state:', error);
    }
  }

  // Session Logs
  static async getSessionLogs(): Promise<SessionLog[]> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.SESSION_LOGS });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting session logs:', error);
      return [];
    }
  }

  static async addSessionLog(log: SessionLog): Promise<void> {
    try {
      const logs = await this.getSessionLogs();
      logs.push(log);
      await Preferences.set({
        key: STORAGE_KEYS.SESSION_LOGS,
        value: JSON.stringify(logs),
      });
    } catch (error) {
      console.error('Error adding session log:', error);
    }
  }

  static async updateSessionLog(updatedLog: SessionLog): Promise<void> {
    try {
      const logs = await this.getSessionLogs();
      const index = logs.findIndex(log => log.id === updatedLog.id);
      if (index !== -1) {
        logs[index] = updatedLog;
        await Preferences.set({
          key: STORAGE_KEYS.SESSION_LOGS,
          value: JSON.stringify(logs),
        });
      }
    } catch (error) {
      console.error('Error updating session log:', error);
    }
  }

  static async deleteSessionLog(logId: string): Promise<void> {
    try {
      const logs = await this.getSessionLogs();
      const filtered = logs.filter(log => log.id !== logId);
      await Preferences.set({
        key: STORAGE_KEYS.SESSION_LOGS,
        value: JSON.stringify(filtered),
      });
    } catch (error) {
      console.error('Error deleting session log:', error);
    }
  }

  static async clearSessionLogs(): Promise<void> {
    try {
      await Preferences.remove({ key: STORAGE_KEYS.SESSION_LOGS });
    } catch (error) {
      console.error('Error clearing session logs:', error);
    }
  }

  static async saveSessionLogs(logs: SessionLog[]): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEYS.SESSION_LOGS,
        value: JSON.stringify(logs),
      });
    } catch (error) {
      console.error('Error saving session logs:', error);
    }
  }

  // Session Summaries
  static async getSessionSummaries(): Promise<SessionSummary[]> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.SESSION_SUMMARIES });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting session summaries:', error);
      return [];
    }
  }

  static async addSessionSummary(summary: SessionSummary): Promise<void> {
    try {
      const summaries = await this.getSessionSummaries();
      summaries.push(summary);
      await Preferences.set({
        key: STORAGE_KEYS.SESSION_SUMMARIES,
        value: JSON.stringify(summaries),
      });
    } catch (error) {
      console.error('Error adding session summary:', error);
    }
  }

  // Suspended Rounds Management
  static async getSuspendedRounds(): Promise<SuspendedRound[]> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.SUSPENDED_ROUNDS });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting suspended rounds:', error);
      return [];
    }
  }

  static async addSuspendedRound(round: SuspendedRound): Promise<void> {
    try {
      const rounds = await this.getSuspendedRounds();
      rounds.push(round);
      await Preferences.set({
        key: STORAGE_KEYS.SUSPENDED_ROUNDS,
        value: JSON.stringify(rounds),
      });
    } catch (error) {
      console.error('Error adding suspended round:', error);
    }
  }

  static async removeSuspendedRound(roundId: string): Promise<void> {
    try {
      const rounds = await this.getSuspendedRounds();
      const filtered = rounds.filter(r => r.id !== roundId);
      await Preferences.set({
        key: STORAGE_KEYS.SUSPENDED_ROUNDS,
        value: JSON.stringify(filtered),
      });
    } catch (error) {
      console.error('Error removing suspended round:', error);
    }
  }

  static async saveSuspendedRounds(rounds: SuspendedRound[]): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEYS.SUSPENDED_ROUNDS,
        value: JSON.stringify(rounds),
      });
    } catch (error) {
      console.error('Error saving suspended rounds:', error);
    }
  }
}
