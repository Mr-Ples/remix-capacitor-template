import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Profile, SessionState, SessionLog } from '../types/pomodoro';
import { SessionController } from '../services/sessionController';
import PomodoroService from '../services/pomodoroService';
import { StorageService } from '../services/storage';
import { LoggingModal } from './LoggingModal';
import { ProfileManager } from './ProfileManager';
import { LogsView } from './LogsView';

export function PomodoroTimer() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showLoggingModal, setShowLoggingModal] = useState(false);
  const [showLogsView, setShowLogsView] = useState(false);
  const [loggingPhaseType, setLoggingPhaseType] = useState<'work' | 'break'>('work');
  const [loggingRoundNumber, setLoggingRoundNumber] = useState<number>(1);
  const [selectedActivityTag, setSelectedActivityTag] = useState<string>('');
  const [currentLogId, setCurrentLogId] = useState<string | null>(null);
  const controllerRef = useRef<SessionController | null>(null);

  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);

  useEffect(() => {
    const controller = SessionController.getInstance();
    controllerRef.current = controller;

    const cleanupListener = controller.addEventListener((event) => {
      if (event.type === 'tick' || event.type === 'stateChange') {
        setSessionState(event.state);
        setTimeRemaining(controller.getTimeRemaining());
      } else if (event.type === 'phaseEnd') {
        // Capture the completed round number before state transitions
        setLoggingRoundNumber(event.state.currentRound);
        setLoggingPhaseType(event.state.isWorkPhase ? 'work' : 'break');

        // AUTO-SAVE LOG
        const newLogId = Date.now().toString();
        const autoLog: SessionLog = {
          id: newLogId,
          profileId: event.state.profileId,
          sessionStartTime: new Date(event.state.startTime).toISOString(),
          roundNumber: event.state.currentRound,
          phaseType: event.state.isWorkPhase ? 'work' : 'break',
          phaseEndTime: new Date().toISOString(),
          notes: '',
          answers: {},
          activityTag: event.state.currentActivityTag,
        };

        StorageService.addSessionLog(autoLog).then(async () => {
          setCurrentLogId(newLogId);
          await loadSessionLogs();
        });

        setShowLoggingModal(true);
        setSessionState(event.state);
        setTimeRemaining(controller.getTimeRemaining());
      } else if (event.type === 'sessionEnd') {
        alert('Session Complete! Great work!');
        setSessionState(null);
        setTimeRemaining(0);
        loadSessionLogs();
      }
    });

    const init = async () => {
      // Load active profile
      const activeProfile = await StorageService.getActiveProfile();
      setProfile(activeProfile);

      // Try to resume existing session
      const resumed = await controller.resumeSession();
      if (resumed) {
        const state = controller.getCurrentState();
        const resumedProfile = controller.getCurrentProfile();
        if (state && resumedProfile) {
          setSessionState(state);
          setProfile(resumedProfile);
          setTimeRemaining(controller.getTimeRemaining());
          setSelectedActivityTag(state.currentActivityTag || '');
        }

        // On Android, check for pending logs
        if (Capacitor.getPlatform() === 'android') {
          try {
            const nativeState = await PomodoroService.getSessionState();
            if (nativeState.pendingLog) {
              setLoggingRoundNumber(nativeState.pendingLog.roundNumber);
              setLoggingPhaseType(nativeState.pendingLog.phaseType as 'work' | 'break');

              // Check/create log logic (simplified)
              const existingLogs = await StorageService.getSessionLogs();
              // This part of logic is a bit duplicated but executed only on resume
              const newLogId = Date.now().toString();
              const autoLog: SessionLog = {
                id: newLogId,
                profileId: nativeState.profileId || resumedProfile?.id || 'unknown',
                sessionStartTime: new Date().toISOString(),
                roundNumber: nativeState.pendingLog.roundNumber,
                phaseType: nativeState.pendingLog.phaseType as 'work' | 'break',
                phaseEndTime: new Date().toISOString(),
                notes: '',
                answers: {},
                activityTag: nativeState.activityTag,
              };

              await StorageService.addSessionLog(autoLog);
              setCurrentLogId(newLogId);
              setShowLoggingModal(true);
            }
          } catch (e) {
            console.error('Error checking native pending log', e);
          }
        }
      }
    };

    init();
    loadSessionLogs();

    return () => {
      cleanupListener();
    };
  }, []);

  const loadSessionLogs = async () => {
    const logs = await StorageService.getSessionLogs();
    setSessionLogs(logs);
  };

  const handleStartSession = async () => {
    if (!profile || !controllerRef.current) return;
    if (sessionState && !sessionState.isActive) {
      await controllerRef.current.unpauseSession();
    } else {
      await controllerRef.current.startSession(profile, selectedActivityTag || undefined);
    }
  };

  const handleActivityTagChange = (tag: string) => {
    setSelectedActivityTag(tag);
    if (controllerRef.current && sessionState) {
      controllerRef.current.setActivityTag(tag || undefined);
    }
  };

  const handlePauseSession = () => {
    if (!controllerRef.current) return;
    controllerRef.current.pauseSession();
  };

  const handleStopSession = async () => {
    if (!controllerRef.current) return;
    // if (confirm('Are you sure you want to stop the session?')) {
    await controllerRef.current.stopSession();
    setSessionState(null);
    setTimeRemaining(0);
    // }
  };

  const handleLogSubmit = async (notes: string, answers: Record<string, string>, activityTag?: string) => {
    if (!profile) return;

    if (currentLogId) {
      // UPDATE existing auto-saved log
      const logs = await StorageService.getSessionLogs();
      const existingLog = logs.find(l => l.id === currentLogId);

      if (existingLog) {
        const updatedLog: SessionLog = {
          ...existingLog,
          notes,
          answers,
          activityTag: activityTag || existingLog.activityTag,
        };
        await StorageService.updateSessionLog(updatedLog);
      }
    } else {
      // Fallback: create new if for some reason currentLogId is missing (legacy flow)
      // This shouldn't happen with new flow but good for safety
      if (!sessionState) return;
      const log: SessionLog = {
        id: Date.now().toString(),
        profileId: profile.id,
        sessionStartTime: new Date(sessionState.startTime).toISOString(),
        roundNumber: loggingRoundNumber,
        phaseType: loggingPhaseType,
        phaseEndTime: new Date().toISOString(),
        notes,
        answers,
        activityTag,
      };
      await StorageService.addSessionLog(log);
    }

    await loadSessionLogs(); // Refresh logs

    // Clear any native pending log marker on Android so we don't
    // prompt the user again for the same phase.
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PomodoroService.clearPendingLog();
      } catch (e) {
        console.error('Error clearing native pending log', e);
      }
    }
    setShowLoggingModal(false);
    setCurrentLogId(null);
  };

  const handleProfileChange = (newProfile: Profile) => {
    setProfile(newProfile);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (): number => {
    if (!sessionState) return 0;
    return ((sessionState.phaseDuration - timeRemaining) / sessionState.phaseDuration) * 100;
  };

  const getCompletedRoundsForTag = (tag: string | undefined): number => {
    if (!tag) return 0;
    const today = new Date().toDateString();
    return sessionLogs.filter(log => {
      const logDate = new Date(log.phaseEndTime).toDateString();
      return log.phaseType === 'work' && log.activityTag === tag && logDate === today;
    }).length;
  };

  const getReferenceTotalRounds = (): number => {
    if (sessionState) return sessionState.totalRounds;
    if (!profile) return 0;

    if (profile.useEndTime && profile.endTime) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

      const [endHourStr, endMinStr] = profile.endTime.split(':');
      const endHour = parseInt(endHourStr || '0', 10);
      const endMinute = parseInt(endMinStr || '0', 10);
      const endMinutes = endHour * 60 + endMinute;

      const minutesUntilEnd = endMinutes - nowMinutes;
      const roundLengthMinutes = profile.workDuration + profile.breakDuration;

      if (minutesUntilEnd > 0 && roundLengthMinutes > 0) {
        return Math.ceil(minutesUntilEnd / roundLengthMinutes);
      }
      return 0;
    }

    return profile.rounds;
  };

  const resolveGoalTarget = (goal: number | string | undefined): number => {
    if (goal === undefined || goal === '') return 0;
    if (typeof goal === 'number') return goal;

    // Handle percentage string "50%"
    if (typeof goal === 'string' && goal.endsWith('%')) {
      const percentage = parseInt(goal.replace('%', ''));
      if (!isNaN(percentage)) {
        const total = getReferenceTotalRounds();
        return Math.max(1, Math.ceil((percentage / 100) * total));
      }
    }

    const parsed = parseInt(goal);
    return isNaN(parsed) ? 0 : parsed;
  };


  const renderGoalProgress = (tag: string | undefined) => {
    if (!tag) return null;

    const target = profile?.goals?.[tag];

    if (!target) {
      return (
        <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          No daily goal set
        </div>
      );
    }

    const completed = getCompletedRoundsForTag(tag);
    // Resolve target (handles numbers and "50%" strings)
    const targetVal = resolveGoalTarget(profile?.goals?.[tag]);

    if (!targetVal) {
      // If we have a goal set but it resolves to 0 (e.g. invalid string), treat as no goal?
      // Or if it's 0 because total rounds is 0 (outside of hours)?
      // Let's show the raw string if we can't resolve it, or just hide?
      // If profile.goals[tag] exists but targetVal is 0, let's show "0".
      if (!profile?.goals?.[tag]) {
        return (
          <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No daily goal set
          </div>
        );
      }
    }

    const isMet = completed >= targetVal;

    // If original goal was a percentage, show it in parens?
    const originalGoal = profile?.goals?.[tag];
    const isPercentage = typeof originalGoal === 'string' && originalGoal.endsWith('%');

    return (
      <div style={{ marginTop: '4px', fontSize: '13px', color: isMet ? 'var(--success-color)' : 'var(--text-secondary)' }}>
        Daily Goal: <strong>{completed} / {targetVal}</strong> rounds {isMet && '✓'}
        {isPercentage && <span style={{ opacity: 0.7, marginLeft: '4px' }}>({originalGoal})</span>}
      </div>
    );
  };

  if (!profile) {
    return <div className="container text-center">Loading...</div>;
  }

  const isSessionActive = sessionState && sessionState.isActive;

  return (
    <div className="max-w-xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center bg-transparent">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text text-transparent">
          Pomodoro Plus
        </h1>
        <button
          className="btn-secondary px-4 py-2 text-sm"
          onClick={() => setShowLogsView(true)}
        >
          Logs
        </button>
      </div>

      {!sessionState && (
        <div className="glass-card p-6">
          <ProfileManager
            currentProfile={profile}
            onProfileChange={handleProfileChange}
          />
        </div>
      )}

      {/* Main Timer Section */}
      <div className="glass-card p-8 flex flex-col items-center">
        {sessionState ? (
          <div className="w-full space-y-8 flex flex-col items-center">
            {/* Round Progress Bar */}
            <div className="relative w-72 h-72 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90 overflow-visible">
                {/* Background Circle */}
                <circle
                  cx="144"
                  cy="144"
                  r="130"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-white/5"
                />
                {/* Progress Circle */}
                <circle
                  cx="144"
                  cy="144"
                  r="130"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 130}
                  strokeDashoffset={2 * Math.PI * 130 * (1 - getProgressPercentage() / 100)}
                  strokeLinecap="round"
                  className={`${sessionState.isWorkPhase ? 'text-accent' : 'text-green-500'} transition-all duration-300`}
                  style={{ filter: 'drop-shadow(0 0 12px currentColor)' }}
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
                <span className="text-6xl font-display font-medium tabular-nums">
                  {formatTime(timeRemaining)}
                </span>
                <span className="text-sm font-medium text-mutedForeground tracking-widest uppercase">
                  {sessionState.isWorkPhase ? 'Work' : 'Break'}
                </span>
              </div>
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm text-mutedForeground">
                Round <span className="text-foreground font-medium">{sessionState.currentRound}</span> of <span className="text-foreground font-medium">{sessionState.totalRounds}</span>
              </p>
            </div>

            {profile.activityTags && profile.activityTags.length > 0 && (
              <div className="w-full max-w-xs transition-all">
                <select
                  className="input-field w-full appearance-none text-center cursor-pointer"
                  value={sessionState.currentActivityTag || ''}
                  onChange={(e) => handleActivityTagChange(e.target.value)}
                >
                  <option value="">No Activity Selected</option>
                  {profile.activityTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <div className="mt-4">
                  {renderGoalProgress(sessionState.currentActivityTag)}
                </div>
              </div>
            )}

            {!profile.useEndTime && (
              <div className="flex gap-4 w-full pt-4">
                {sessionState.isActive ? (
                  <button className="btn-primary flex-1" onClick={handlePauseSession}>
                    Pause
                  </button>
                ) : (
                  <button className="btn-primary flex-1" onClick={handleStartSession}>
                    Resume
                  </button>
                )}
                <button
                  className="btn-secondary px-6"
                  onClick={handleStopSession}
                >
                  Stop
                </button>
              </div>
            )}

            {profile.useEndTime && (
              <div className="w-full pt-4">
                <button
                  className="btn-secondary w-full"
                  onClick={handleStopSession}
                >
                  Stop Session
                </button>
              </div>
            )}

            <div className="pt-4 text-xs text-mutedForeground text-center space-y-1 opacity-50">
              <p>Session: {sessionState.totalRounds * (profile.workDuration + profile.breakDuration)} min</p>
              <p>Remaining: {Math.floor(
                ((sessionState.totalRounds - sessionState.currentRound) *
                  (profile.workDuration + profile.breakDuration) +
                  timeRemaining / 60)
              )} min</p>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-8 flex flex-col items-center py-4">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-medium">Ready to Start?</h2>
              {profile.useEndTime && profile.endTime ? (
                <p className="text-mutedForeground text-sm max-w-xs">
                  Running until <span className="text-foreground">{profile.endTime}</span> with {profile.workDuration}/{profile.breakDuration} rounds.
                </p>
              ) : (
                <p className="text-mutedForeground text-sm max-w-xs">
                  <span className="text-foreground">{profile.rounds}</span> rounds of {profile.workDuration}/{profile.breakDuration} min sessions.
                </p>
              )}
            </div>

            {profile.activityTags && profile.activityTags.length > 0 && (
              <div className="w-full max-w-xs space-y-2">
                <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Activity</label>
                <select
                  className="input-field w-full appearance-none cursor-pointer"
                  value={selectedActivityTag}
                  onChange={(e) => setSelectedActivityTag(e.target.value)}
                >
                  <option value="">None</option>
                  {profile.activityTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <div className="pt-2">
                  {renderGoalProgress(selectedActivityTag)}
                </div>
              </div>
            )}

            <button className="btn-primary w-full max-w-xs text-lg" onClick={handleStartSession}>
              Start Session
            </button>
          </div>
        )}
      </div>

      {/* Daily Goals Overview */}
      {profile && profile.goals && Object.keys(profile.goals).length > 0 && (
        <div className="glass-card p-6 space-y-6">
          <h3 className="text-lg font-medium border-b border-white/5 pb-4">Daily Goals</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {Object.entries(profile.goals || {}).map(([tag, rawTarget]) => {
              const completed = getCompletedRoundsForTag(tag);
              const target = resolveGoalTarget(rawTarget);
              const percent = target > 0 ? Math.min(100, (completed / target) * 100) : (completed > 0 ? 100 : 0);
              const isMet = completed >= target;

              return (
                <div key={tag} className="flex flex-col items-center space-y-3 p-2 group">
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90 overflow-visible">
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="text-white/5"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeDasharray={2 * Math.PI * 36}
                        strokeDashoffset={2 * Math.PI * 36 * (1 - percent / 100)}
                        strokeLinecap="round"
                        className={`${isMet ? 'text-green-500' : 'text-accent'} transition-all duration-500 ease-out`}
                        style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-medium tabular-nums">
                        {completed}
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium truncate w-24" title={tag}>{tag}</p>
                    <p className="text-[10px] text-mutedForeground">Goal: {target}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showLoggingModal && sessionState && (
        <LoggingModal
          isOpen={showLoggingModal}
          onClose={() => {
            setShowLoggingModal(false);
            setCurrentLogId(null);
          }}
          onSubmit={handleLogSubmit}
          profile={profile}
          phaseType={loggingPhaseType}
          roundNumber={loggingRoundNumber}
          totalRounds={sessionState.totalRounds}
          currentActivityTag={sessionState.currentActivityTag}
        />
      )}

      <LogsView
        isOpen={showLogsView}
        onClose={() => setShowLogsView(false)}
        onDataChange={loadSessionLogs}
        defaultProfileId={profile?.id}
      />
    </div>
  );
}
