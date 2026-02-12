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
  const [selectedActivityTag, setSelectedActivityTag] = useState<string>('');
  const controllerRef = useRef<SessionController | null>(null);

  useEffect(() => {
    initializeApp();
    return () => {
      if (controllerRef.current) {
        controllerRef.current.removeNotificationListeners();
      }
    };
  }, []);

  const initializeApp = async () => {
    // Load active profile
    const activeProfile = await StorageService.getActiveProfile();
    setProfile(activeProfile);

    // Initialize session controller
    const controller = new SessionController();
    controllerRef.current = controller;

    // Set up event listeners
    controller.addEventListener((event) => {
      if (event.type === 'tick' || event.type === 'stateChange') {
        setSessionState(event.state);
        setTimeRemaining(controller.getTimeRemaining());
      } else if (event.type === 'phaseEnd') {
        setLoggingPhaseType(event.state.isWorkPhase ? 'break' : 'work');
        setShowLoggingModal(true);
        setSessionState(event.state);
        setTimeRemaining(controller.getTimeRemaining());
      } else if (event.type === 'sessionEnd') {
        alert('Session Complete! Great work!');
        setSessionState(null);
        setTimeRemaining(0);
      }
    });

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

      // On Android, if a phase completed while the app was closed,
      // the native foreground service may have a pending log entry.
      // Check for it and show the logging modal accordingly.
      if (Capacitor.getPlatform() === 'android') {
        try {
          const nativeState = await PomodoroService.getSessionState();
          if (nativeState.pendingLog) {
            setLoggingPhaseType(nativeState.pendingLog.phaseType as 'work' | 'break');
            setShowLoggingModal(true);
          }
        } catch (e) {
          console.error('Error checking native pending log', e);
        }
      }
    }
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
    if (confirm('Are you sure you want to stop the session?')) {
      await controllerRef.current.stopSession();
      setSessionState(null);
      setTimeRemaining(0);
    }
  };

  const handleLogSubmit = async (notes: string, answers: Record<string, string>, activityTag?: string) => {
    if (!sessionState || !profile) return;

    const log: SessionLog = {
      id: Date.now().toString(),
      profileId: profile.id,
      sessionStartTime: new Date(sessionState.startTime).toISOString(),
      roundNumber: sessionState.currentRound,
      phaseType: loggingPhaseType,
      phaseEndTime: new Date().toISOString(),
      notes,
      answers,
      activityTag,
    };

    await StorageService.addSessionLog(log);
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
          disabled={!!isSessionActive}
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
          onClose={() => setShowLoggingModal(false)}
          onSubmit={handleLogSubmit}
          profile={profile}
          phaseType={loggingPhaseType}
          roundNumber={sessionState.currentRound}
          totalRounds={sessionState.totalRounds}
          currentActivityTag={sessionState.currentActivityTag}
        />
      )}

      <LogsView
        isOpen={showLogsView}
        onClose={() => setShowLogsView(false)}
      />
    </div>
  );
}
