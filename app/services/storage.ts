import { Preferences } from '@capacitor/preferences';
import type { Profile, SessionState, SessionLog, SessionSummary } from '../types/pomodoro';
import { DEFAULT_PROFILE } from '../types/pomodoro';

const STORAGE_KEYS = {
  PROFILES: 'pomodoro_profiles',
  ACTIVE_PROFILE: 'pomodoro_active_profile',
  SESSION_STATE: 'pomodoro_session_state',
  SESSION_LOGS: 'pomodoro_session_logs',
  SESSION_SUMMARIES: 'pomodoro_session_summaries',
};

export class StorageService {
  // Profile Management
  static async getProfiles(): Promise<Profile[]> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.PROFILES });
      if (value) {
        return JSON.parse(value);
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

  static async clearSessionLogs(): Promise<void> {
    try {
      await Preferences.remove({ key: STORAGE_KEYS.SESSION_LOGS });
    } catch (error) {
      console.error('Error clearing session logs:', error);
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
}
