import { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Profile, SessionState, SessionLog, SuspendedRound } from '../types/pomodoro';
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
  const [activeSlide, setActiveSlide] = useState(0);
  const controllerRef = useRef<SessionController | null>(null);

  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [suspendedRounds, setSuspendedRounds] = useState<SuspendedRound[]>([]);

  const [completedPhaseState, setCompletedPhaseState] = useState<SessionState | null>(null);

  // Touch gesture state for swipe navigation
  const [touchStartX, setTouchStartX] = useState<number>(0);
  const [touchEndX, setTouchEndX] = useState<number>(0);

  // Track current session start time (persists even when session stops)
  const [currentSessionStartTime, setCurrentSessionStartTime] = useState<number | null>(null);

  // When no session is ongoing, daily targets use the most recent session for this profile
  const effectiveSessionStartTime = useMemo(() => {
    if (sessionState?.isActive && sessionState.sessionStartTime != null) {
      return sessionState.sessionStartTime;
    }
    if (currentSessionStartTime != null) return currentSessionStartTime;
    if (!profile?.id || sessionLogs.length === 0) return null;
    const profileLogs = sessionLogs.filter((l) => l.profileId === profile.id);
    if (profileLogs.length === 0) return null;
    const latest = profileLogs.reduce((best, log) =>
      new Date(log.phaseEndTime).getTime() > new Date(best.phaseEndTime).getTime() ? log : best
    );
    return new Date(latest.sessionStartTime).getTime();
  }, [sessionState?.isActive, sessionState?.sessionStartTime, currentSessionStartTime, profile?.id, sessionLogs]);

  useEffect(() => {
    const controller = SessionController.getInstance();
    controllerRef.current = controller;

    const cleanupListener = controller.addEventListener((event) => {
      if (event.type === 'tick' || event.type === 'stateChange') {
        setSessionState(event.state);
        setTimeRemaining(controller.getTimeRemaining());
        // Update current session start time when session state changes
        if (event.state?.sessionStartTime) {
          setCurrentSessionStartTime(event.state.sessionStartTime);
        }
      } else if (event.type === 'phaseEnd') {
        // Capture the state of the COMPLETED round/phase for the logging modal
        setCompletedPhaseState(event.state);

        // AUTO-SAVE LOG
        const newLogId = Date.now().toString();
        const autoLog: SessionLog = {
          id: newLogId,
          profileId: event.state.profileId,
          sessionStartTime: new Date(event.state.sessionStartTime).toISOString(),
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
        // Do NOT setSessionState(event.state) here. The controller will emit a 'stateChange'
        // event with the new state, which will update sessionState.
        // This prevents race conditions and ensures sessionState reflects the *current* phase.
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
              // Set completedPhaseState for the pending log
              setCompletedPhaseState({
                profileId: nativeState.profileId || resumedProfile?.id || 'unknown',
                currentRound: nativeState.pendingLog.roundNumber,
                totalRounds: nativeState.totalRounds ?? 0, // Fallback, should be provided by nativeState
                isWorkPhase: nativeState.pendingLog.phaseType === 'work',
                startTime: Date.now(), // Placeholder, not strictly needed for display
                sessionStartTime: nativeState.sessionStartTime || Date.now(),
                elapsedTime: 0, // Placeholder
                phaseDuration: 0, // Placeholder
                isActive: false, // It's a pending log from a completed phase
                currentActivityTag: nativeState.activityTag,
              });

              // Check/create log logic (simplified)
              const newLogId = Date.now().toString();
              const autoLog: SessionLog = {
                id: newLogId,
                profileId: nativeState.profileId || resumedProfile?.id || 'unknown',
                sessionStartTime: new Date(nativeState.sessionStartTime || Date.now()).toISOString(),
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
    const suspended = await StorageService.getSuspendedRounds();
    setSuspendedRounds(suspended);
  };

  const handleStartSession = async () => {
    if (!profile || !controllerRef.current) return;
    if (sessionState && !sessionState.isActive) {
      await controllerRef.current.unpauseSession();
    } else {
      // Starting a new session - update the session start time
      setCurrentSessionStartTime(Date.now());
      await controllerRef.current.startSession(profile, selectedActivityTag || undefined);
    }
  };

  const handleActivityTagChange = async (tag: string) => {
    let suspend = false;
    if (controllerRef.current && sessionState && sessionState.isActive && sessionState.isWorkPhase && sessionState.currentActivityTag && sessionState.currentActivityTag !== tag) {
      if (window.confirm(`Do you want to complete the "${sessionState.currentActivityTag}" round later?`)) {
        suspend = true;
      }
    }

    setSelectedActivityTag(tag);
    if (controllerRef.current && sessionState) {
      await controllerRef.current.switchActivityWithSuspension(tag, suspend);
      await loadSessionLogs();
    }
  };

  const handleResumeSuspendedRound = async (suspendedRound: SuspendedRound) => {
    if (controllerRef.current) {
      await controllerRef.current.resumeSuspendedRound(suspendedRound);
      await loadSessionLogs();
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

  const handleLogDelete = async () => {
    if (currentLogId) {
      await StorageService.deleteSessionLog(currentLogId);
      await loadSessionLogs(); // Refresh logs
    }

    // Clear any native pending log marker on Android
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

  // Touch event handlers for swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === 0 || touchEndX === 0) return;

    const swipeDistance = touchStartX - touchEndX;
    const minSwipeDistance = 50; // Minimum swipe distance in pixels

    if (swipeDistance > minSwipeDistance) {
      // Swiped left - go to next slide
      if (activeSlide === 0) setActiveSlide(1);
    } else if (swipeDistance < -minSwipeDistance) {
      // Swiped right - go to previous slide
      if (activeSlide === 1) setActiveSlide(0);
    }

    // Reset touch positions
    setTouchStartX(0);
    setTouchEndX(0);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDurationCompact = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    }
  };

  const getProgressPercentage = (): number => {
    if (!sessionState) return 0;
    return ((sessionState.phaseDuration - timeRemaining) / sessionState.phaseDuration) * 100;
  };

  if (!profile) {
    return <div className="container text-center">Loading...</div>;
  }
  const getCompletedRoundsForTag = (tag: string | undefined): number => {
    if (!tag) return 0;
    // Filter by effective session (current when active, else most recent for profile)
    if (effectiveSessionStartTime == null) return 0;
    return sessionLogs.filter(log => {
      const logTime = new Date(log.phaseEndTime).getTime();
      return log.profileId === profile.id && log.activityTag === tag && logTime >= effectiveSessionStartTime;
    }).length;
  };

  const getUncategorizedRounds = (): number => {
    // Filter by effective session (current when active, else most recent for profile)
    if (effectiveSessionStartTime == null) return 0;
    const allTags = profile.activityTags || [];
    return sessionLogs.filter(log => {
      const logTime = new Date(log.phaseEndTime).getTime();
      if (log.profileId !== profile.id || logTime < effectiveSessionStartTime) return false;
      // Strictly "uncategorized" if no tag OR tag is not in the official list
      return !log.activityTag || !allTags.includes(log.activityTag);
    }).length;
  };

  const getReferenceTotalRounds = (): number => {
    if (sessionState) return sessionState.totalRounds;
    if (!profile) return 0;

    if (profile.useEndTime && profile.endTime) {
      const now = new Date();
      const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

      const [endHourStr, endMinStr] = profile.endTime.split(':');
      const endHour = parseInt(endHourStr || '0', 10);
      const endMinute = parseInt(endMinStr || '0', 10);
      const endSeconds = endHour * 3600 + endMinute * 60;

      const secondsUntilEnd = endSeconds - nowSeconds;
      const roundLengthSeconds = profile.workDuration + profile.breakDuration;

      if (secondsUntilEnd > 0 && roundLengthSeconds > 0) {
        return Math.ceil(secondsUntilEnd / roundLengthSeconds);
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
          No session target set
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
            No session target set
          </div>
        );
      }
    }

    const isMet = completed >= targetVal;

    // If original goal was a percentage, show it in parens?
    const originalGoal = profile?.goals?.[tag];
    const isPercentage = typeof originalGoal === 'string' && originalGoal.endsWith('%');

    const tagColor = profile?.tagColors?.[tag] || 'var(--accent)';
    return (
      <div style={{ marginTop: '4px', fontSize: '13px', color: isMet ? 'var(--success-color)' : 'var(--text-secondary)' }}>
        Session Target: <strong>{completed} / {targetVal}</strong> rounds {isMet && '✓'}
        <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.1)', marginTop: '4px', borderRadius: '1px' }}>
          <div style={{ width: `${Math.min(100, (completed / targetVal) * 100)}%`, height: '100%', background: tagColor, borderRadius: '1px' }} />
        </div>
        {isPercentage && <span style={{ opacity: 0.7, marginLeft: '4px' }}>({originalGoal})</span>}
      </div>
    );
  };


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
                  className="transition-all duration-300"
                  style={{
                    filter: 'drop-shadow(0 0 12px currentColor)',
                    color: sessionState.isWorkPhase
                      ? (sessionState.currentActivityTag ? profile.tagColors?.[sessionState.currentActivityTag] : 'var(--accent)')
                      : '#22c55e'
                  }}
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
                {sessionState.currentActivityTag && suspendedRounds.find(r => r.activityTag === sessionState.currentActivityTag) && (
                  <button
                    className="btn-secondary w-full mt-4 text-sm"
                    onClick={() => {
                      const round = suspendedRounds.find(r => r.activityTag === sessionState.currentActivityTag);
                      if (round) handleResumeSuspendedRound(round);
                    }}
                  >
                    Resume Suspended Round ({formatTime(suspendedRounds.find(r => r.activityTag === sessionState.currentActivityTag)?.timeRemaining || 0)})
                  </button>
                )}
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
              <p>Session: {Math.floor(sessionState.totalRounds * (profile.workDuration + profile.breakDuration) / 60)} min</p>
              <p>Remaining: {Math.floor(
                ((sessionState.totalRounds - sessionState.currentRound) *
                  (profile.workDuration + profile.breakDuration) +
                  timeRemaining) / 60
              )} min</p>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-8 flex flex-col items-center py-4">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-medium">Ready to Start?</h2>
              {profile.useEndTime && profile.endTime ? (
                <p className="text-mutedForeground text-sm max-w-xs">
                  Running until <span className="text-foreground">{profile.endTime}</span> with {formatDurationCompact(profile.workDuration)}/{formatDurationCompact(profile.breakDuration)} rounds.
                </p>
              ) : (
                <p className="text-mutedForeground text-sm max-w-xs">
                  <span className="text-foreground">{profile.rounds}</span> rounds of {formatDurationCompact(profile.workDuration)}/{formatDurationCompact(profile.breakDuration)} sessions.
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
                {selectedActivityTag && suspendedRounds.find(r => r.activityTag === selectedActivityTag) && (
                  <button
                    className="btn-secondary w-full mt-4 text-sm"
                    onClick={() => {
                      const round = suspendedRounds.find(r => r.activityTag === selectedActivityTag);
                      if (round) handleResumeSuspendedRound(round);
                    }}
                  >
                    Resume Suspended Round ({formatTime(suspendedRounds.find(r => r.activityTag === selectedActivityTag)?.timeRemaining || 0)})
                  </button>
                )}
              </div>
            )}

            <button className="btn-primary w-full max-w-xs text-lg" onClick={handleStartSession}>
              Start Session
            </button>
          </div>
        )}
      </div>

      {/* Session Progress Section (Targets & Chronological) */}
      <div className="glass-card overflow-hidden">
        <div className="flex border-b border-white/5">
          <button
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeSlide === 0 ? 'text-foreground border-b-2 border-accent' : 'text-mutedForeground hover:text-foreground'}`}
            onClick={() => setActiveSlide(0)}
          >
            Session Targets
          </button>
          <button
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeSlide === 1 ? 'text-foreground border-b-2 border-accent' : 'text-mutedForeground hover:text-foreground'}`}
            onClick={() => setActiveSlide(1)}
          >
            Chronological View
          </button>
        </div>

        <div
          className="p-6 relative min-h-[400px]"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {activeSlide === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {(profile.activityTags || []).map((tag) => {
                const rawTarget = profile.goals?.[tag];
                const completed = getCompletedRoundsForTag(tag);
                const target = resolveGoalTarget(rawTarget);
                const percent = target > 0 ? Math.min(100, (completed / target) * 100) : (completed > 0 ? 100 : 0);
                const isMet = target > 0 && completed >= target;
                const tagColor = profile.tagColors?.[tag] || 'var(--accent)';

                return (
                  <div key={tag} className="flex flex-col items-center space-y-3 p-2 group">
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90 overflow-visible">
                        <circle cx="40" cy="40" r="36" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-white/5" />
                        <circle
                          cx="40" cy="40" r="36" fill="transparent" stroke="currentColor" strokeWidth="4"
                          strokeDasharray={2 * Math.PI * 36}
                          strokeDashoffset={2 * Math.PI * 36 * (1 - percent / 100)}
                          strokeLinecap="round"
                          className="transition-all duration-500 ease-out"
                          style={{ filter: `drop-shadow(0 0 6px ${tagColor})`, color: tagColor }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-medium tabular-nums">{completed}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium truncate w-24" title={tag}>{tag}</p>
                      <p className="text-[10px] text-mutedForeground">Target: {target}</p>
                    </div>
                  </div>
                );
              })}

              {/* Uncategorized Circle */}
              {(() => {
                const uncategorized = getUncategorizedRounds();
                const totalPlanned = getReferenceTotalRounds();
                const taggedTargetsSum = Object.values(profile.goals || {}).reduce((acc: number, goal) => {
                  return acc + resolveGoalTarget(goal);
                }, 0);

                const target = Math.max(0, totalPlanned - taggedTargetsSum);
                const percent = target > 0 ? Math.min(100, (uncategorized / target) * 100) : (uncategorized > 0 ? 100 : 0);
                const tagColor = '#64748b'; // Muted grey for uncategorized

                if (target === 0 && uncategorized === 0) return null;

                return (
                  <div className="flex flex-col items-center space-y-3 p-2 group">
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90 overflow-visible">
                        <circle cx="40" cy="40" r="36" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-white/5" />
                        <circle
                          cx="40" cy="40" r="36" fill="transparent" stroke="currentColor" strokeWidth="4"
                          strokeDasharray={2 * Math.PI * 36}
                          strokeDashoffset={2 * Math.PI * 36 * (1 - percent / 100)}
                          strokeLinecap="round"
                          className="transition-all duration-500 ease-out"
                          style={{ filter: `drop-shadow(0 0 6px ${tagColor})`, color: tagColor }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-medium tabular-nums">{uncategorized}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium truncate w-24">Uncategorized</p>
                      <p className="text-[10px] text-mutedForeground">Target: {target}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 animate-in fade-in slide-in-from-left-4 duration-300">
              {/* Chronological Circular Timeline */}
              <div className="relative w-48 h-48">
                <svg className="w-full h-full transform -rotate-90 overflow-visible">
                  <circle cx="96" cy="96" r="80" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-white/5" />
                  {(() => {
                    // Filter by effective session (current when active, else most recent for profile)
                    const todayLogs = effectiveSessionStartTime != null
                      ? sessionLogs
                        .filter(log => log.profileId === profile.id && new Date(log.phaseEndTime).getTime() >= effectiveSessionStartTime)
                        .sort((a, b) => new Date(a.phaseEndTime).getTime() - new Date(b.phaseEndTime).getTime())
                      : [];

                    if (todayLogs.length === 0) return null;

                    const totalPlanned = getReferenceTotalRounds();
                    const totalForCircle = Math.max(todayLogs.length, totalPlanned);
                    const dashArray = 2 * Math.PI * 80;

                    return todayLogs.map((log, i) => {
                      const segmentLength = (1 / totalForCircle) * dashArray;
                      const segmentOffset = (i / totalForCircle) * dashArray;
                      const color = log.activityTag ? (profile.tagColors?.[log.activityTag] || 'var(--accent)') : '#64748b';

                      return (
                        <circle
                          key={log.id}
                          cx="96" cy="96" r="80"
                          fill="transparent"
                          stroke={color}
                          strokeWidth="12"
                          strokeDasharray={`${Math.max(0, segmentLength - 2)} ${dashArray}`}
                          strokeDashoffset={-segmentOffset}
                          strokeLinecap="round"
                          className="transition-all duration-500"
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold tabular-nums">
                    {effectiveSessionStartTime != null
                      ? sessionLogs.filter(log => log.profileId === profile.id && new Date(log.phaseEndTime).getTime() >= effectiveSessionStartTime).length
                      : 0}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-mutedForeground">Rounds</span>
                </div>
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {/* Legend */}
                {Object.keys(profile.tagColors || {}).concat(['Uncategorized']).map(tag => {
                  const count = tag === 'Uncategorized'
                    ? getUncategorizedRounds()
                    : getCompletedRoundsForTag(tag);
                  if (count === 0) return null;
                  const color = tag === 'Uncategorized' ? '#64748b' : (profile.tagColors?.[tag] || 'var(--accent)');
                  return (
                    <div key={tag} className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[10px] font-medium">{tag}: {count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showLoggingModal && completedPhaseState && profile && (
        <LoggingModal
          isOpen={showLoggingModal}
          onClose={() => {
            setShowLoggingModal(false);
            setCurrentLogId(null);
            setCompletedPhaseState(null); // Clear completed state when modal closes
          }}
          onSubmit={handleLogSubmit}
          onDelete={handleLogDelete}
          profile={profile}
          phaseType={completedPhaseState.isWorkPhase ? 'work' : 'break'}
          roundNumber={completedPhaseState.currentRound}
          totalRounds={completedPhaseState.totalRounds}
          currentActivityTag={completedPhaseState.currentActivityTag}
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
