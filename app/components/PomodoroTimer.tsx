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
    await controllerRef.current.startSession(profile, selectedActivityTag || undefined);
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
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>
          🍅 Pomodoro Plus
        </h1>
        <button
          className="btn btn-secondary"
          onClick={() => setShowLogsView(true)}
        >
          View Logs
        </button>
      </div>

      {!isSessionActive && (
        <ProfileManager
          currentProfile={profile}
          onProfileChange={handleProfileChange}
        />
      )}

      <div className="card text-center">
        {sessionState ? (
          <>
            <div className="mb-3">
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Round {sessionState.currentRound} of {sessionState.totalRounds}
              </div>
              <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
                {sessionState.isWorkPhase ? 'Work Session' : 'Break Time'}
              </div>
              <div style={{ fontSize: '72px', fontWeight: '700', marginBottom: '16px' }}>
                {formatTime(timeRemaining)}
              </div>
              <div style={{
                width: '100%',
                height: '12px',
                backgroundColor: 'var(--surface-light)',
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: `${getProgressPercentage()}%`,
                  height: '100%',
                  backgroundColor: sessionState.isWorkPhase ? 'var(--primary-color)' : 'var(--success-color)',
                  transition: 'width 0.3s ease'
                }} />
              </div>

              {profile.activityTags && profile.activityTags.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="label" style={{ fontSize: '14px', marginBottom: '8px' }}>Activity</label>
                  <select
                    className="select"
                    value={sessionState.currentActivityTag || ''}
                    onChange={(e) => handleActivityTagChange(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">None</option>
                    {profile.activityTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                  {renderGoalProgress(sessionState.currentActivityTag)}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-center">
              {sessionState.isActive ? (
                <button className="btn btn-warning btn-large" onClick={handlePauseSession}>
                  Pause
                </button>
              ) : (
                <button className="btn btn-success btn-large" onClick={handleStartSession}>
                  Resume
                </button>
              )}
              <button className="btn btn-danger" onClick={handleStopSession}>
                Stop
              </button>
            </div>

            <div className="mt-3 text-secondary" style={{ fontSize: '14px' }}>
              {sessionState && (
                <div>
                  Total session time: {sessionState.totalRounds} × ({profile.workDuration} + {profile.breakDuration}) ={' '}
                  {sessionState.totalRounds * (profile.workDuration + profile.breakDuration)} minutes
                </div>
              )}
              <div className="mt-1">
                Time remaining in session: {' '}
                {Math.floor(
                  ((sessionState.totalRounds - sessionState.currentRound) *
                    (profile.workDuration + profile.breakDuration) +
                    timeRemaining / 60)
                )} minutes
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
                Ready to Start?
              </div>
              {profile.useEndTime && profile.endTime ? (
                <>
                  <div className="text-secondary" style={{ fontSize: '14px' }}>
                    Session will run until {profile.endTime} using rounds of{' '}
                    {profile.workDuration} min work + {profile.breakDuration} min break.
                  </div>
                  <div className="text-secondary" style={{ fontSize: '14px' }}>
                    Rounds are calculated when you tap Start based on the current time.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-secondary" style={{ fontSize: '14px' }}>
                    {profile.rounds} rounds × ({profile.workDuration} min work + {profile.breakDuration} min break)
                  </div>
                  <div className="text-secondary" style={{ fontSize: '14px' }}>
                    Total duration: {profile.rounds * (profile.workDuration + profile.breakDuration)} minutes
                  </div>
                </>
              )}
            </div>

            {profile.activityTags && profile.activityTags.length > 0 && (
              <div className="input-group mb-3">
                <label className="label">Activity (optional)</label>
                <select
                  className="select"
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
                {renderGoalProgress(selectedActivityTag)}
              </div>
            )}

            <button className="btn btn-primary btn-large" onClick={handleStartSession}>
              Start Session
            </button>
          </>
        )}
      </div>

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
      />

      {/* Daily Goals Overview */}
      {profile && profile.goals && Object.keys(profile.goals).length > 0 && (
        <div className="card mt-4">
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Daily Goals</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(profile.goals || {}).map(([tag, rawTarget]) => {
              const completed = getCompletedRoundsForTag(tag);
              const target = resolveGoalTarget(rawTarget);

              // Avoid division by zero
              const percent = target > 0 ? Math.min(100, (completed / target) * 100) : (completed > 0 ? 100 : 0);
              const isMet = completed >= target;
              const isPercentage = typeof rawTarget === 'string' && rawTarget.endsWith('%');

              return (
                <div key={tag}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
                    <span style={{ fontWeight: '500' }}>{tag}</span>
                    <span style={{ color: isMet ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                      {completed} / {target} {isMet && '✓'}
                      {isPercentage && <span style={{ opacity: 0.7, marginLeft: '4px' }}>({rawTarget})</span>}
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: 'var(--surface-light)',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${percent}%`,
                      height: '100%',
                      backgroundColor: isMet ? 'var(--success-color)' : 'var(--primary-color)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
