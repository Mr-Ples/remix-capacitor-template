import { useState, useEffect } from 'react';
import type { SessionLog, Profile } from '../types/pomodoro';
import { StorageService } from '../services/storage';
import { exportLogs } from '../services/logExport';

interface LogsViewProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChange?: () => void;
  defaultProfileId?: string;
}

export function LogsView({ isOpen, onClose, onDataChange, defaultProfileId }: LogsViewProps) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(''); // empty means all dates
  const [loading, setLoading] = useState(true);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<SessionLog | null>(null);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [newEntryData, setNewEntryData] = useState<{
    profileId: string;
    roundNumber: number;
    phaseType: 'work' | 'break';
    phaseEndTime: string;
    notes: string;
    answers: Record<string, string>;
    activityTag?: string;
  }>({
    profileId: '',
    roundNumber: 1,
    phaseType: 'work',
    phaseEndTime: new Date().toISOString().slice(0, 16), // Format for datetime-local
    notes: '',
    answers: {},
  });

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      setIsAddingEntry(false);
      if (defaultProfileId) {
        setSelectedProfileId(defaultProfileId);
      }
    }
  }, [isOpen]);

  const loadLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    const loadedLogs = await StorageService.getSessionLogs();
    const loadedProfiles = await StorageService.getProfiles();

    // Sort logs by date, most recent first
    loadedLogs.sort((a, b) =>
      new Date(b.phaseEndTime).getTime() - new Date(a.phaseEndTime).getTime()
    );

    setLogs(loadedLogs);
    setProfiles(loadedProfiles);
    setLoading(false);

    // Initialize new entry profile if not set
    if (!newEntryData.profileId && loadedProfiles.length > 0) {
      setNewEntryData(prev => ({ ...prev, profileId: loadedProfiles[0].id }));
    }
  };

  const handleClearLogs = async () => {
    const filteredLogs = getFilteredLogs();
    if (filteredLogs.length === 0) return;

    const filteredIds = new Set(filteredLogs.map(log => log.id));
    const updatedLogs = logs.filter(log => !filteredIds.has(log.id));

    // if (confirm(`Are you sure you want to clear the ${filteredLogs.length} visible logs? This cannot be undone.`)) {
    await StorageService.saveSessionLogs(updatedLogs);
    await loadLogs();
    onDataChange?.();
    // }
  };

  const getProfileName = (profileId: string): string => {
    const profile = profiles.find(p => p.id === profileId);
    return profile ? profile.name : 'Unknown Profile';
  };

  const getFilteredLogs = (): SessionLog[] => {
    return logs.filter(log => {
      const matchProfile = selectedProfileId === 'all' || log.profileId === selectedProfileId;
      const logDate = new Date(log.phaseEndTime).toISOString().split('T')[0];
      const matchDate = !selectedDate || logDate === selectedDate;
      return matchProfile && matchDate;
    });
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const handleExportLogs = async () => {
    const logsToExport = getFilteredLogs();
    if (logsToExport.length === 0) {
      console.warn('No logs to export for the selected profile.');
      return;
    }

    try {
      await exportLogs(logsToExport);
    } catch (error) {
      console.error('Error exporting logs', error);
      console.error('Failed to export logs. Please try again.');
    }
  };

  const handleEditLog = (log: SessionLog) => {
    setEditingLogId(log.id);
    setEditFormData({ ...log });
  };

  const handleCancelEdit = () => {
    setEditingLogId(null);
    setEditFormData(null);
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;

    await StorageService.updateSessionLog(editFormData);
    await loadLogs(true);
    onDataChange?.();
    setEditingLogId(null);
    setEditFormData(null);
  };

  const handleDeleteLog = async (logId: string) => {
    // if (confirm('Are you sure you want to delete this log entry?')) {
    const updatedLogs = logs.filter(log => log.id !== logId);
    await StorageService.saveSessionLogs(updatedLogs);
    await loadLogs();
    onDataChange?.();
    // }
  };

  const handleAddEntryClick = () => {
    setIsAddingEntry(true);
    setNewEntryData({
      profileId: profiles.length > 0 ? profiles[0].id : '',
      roundNumber: 1,
      phaseType: 'work',
      phaseEndTime: new Date().toISOString().slice(0, 16),
      notes: '',
      answers: {},
    });
  };

  const handleSaveNewEntry = async () => {
    if (!newEntryData.profileId) return;

    // Check for duplicates
    const entryDate = new Date(newEntryData.phaseEndTime).toLocaleDateString();
    const isDuplicate = logs.some(log =>
      log.profileId === newEntryData.profileId &&
      log.roundNumber === newEntryData.roundNumber &&
      log.phaseType === newEntryData.phaseType &&
      new Date(log.phaseEndTime).toLocaleDateString() === entryDate
    );

    if (isDuplicate) {
      alert('A log entry for this profile, round, and phase already exists for this date.');
      return;
    }

    const logEntry: SessionLog = {
      id: Date.now().toString(),
      profileId: newEntryData.profileId,
      sessionStartTime: newEntryData.phaseEndTime, // Approximation
      roundNumber: newEntryData.roundNumber,
      phaseType: newEntryData.phaseType,
      phaseEndTime: newEntryData.phaseEndTime,
      notes: newEntryData.notes,
      answers: newEntryData.answers,
      activityTag: newEntryData.activityTag,
    };

    await StorageService.addSessionLog(logEntry);
    await loadLogs(true);
    onDataChange?.();
    setIsAddingEntry(false);
  };

  if (!isOpen) return null;

  const filteredLogs = getFilteredLogs();

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const selectedNewEntryProfile = profiles.find(p => p.id === newEntryData.profileId);
  const relevantQuestions = selectedNewEntryProfile?.questions.filter(
    q => q.type === newEntryData.phaseType || q.type === 'both'
  ) || [];

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={-1}
      aria-label="Close modal"
    >
      <div
        className="modal"
        style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}
        role="dialog"
        aria-labelledby="logs-view-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="logs-view-title">Session Logs</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="mb-3">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="label" htmlFor="profile-filter">Filter by Profile</label>
              <select
                id="profile-filter"
                className="select"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
              >
                <option value="all">All Profiles</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="label" htmlFor="date-filter">Filter by Date</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="date-filter"
                  type="date"
                  className="input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ flex: 1 }}
                />
                {selectedDate && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setSelectedDate('')}
                    style={{ padding: '0 12px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <button
                className="btn btn-success"
                onClick={handleAddEntryClick}
              >
                Add Entry
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleExportLogs}
                disabled={logs.length === 0}
              >
                Export
              </button>
              <button
                className="btn btn-danger"
                onClick={handleClearLogs}
                disabled={filteredLogs.length === 0}
              >
                {selectedProfileId === 'all' && !selectedDate ? 'Clear All Logs' : 'Clear Filtered'}
              </button>
            </div>
          </div>
        </div>

        {isAddingEntry ? (
          <div className="card" style={{ border: '2px solid var(--success-color)' }}>
            <h3 style={{ marginBottom: '16px' }}>Add Manual Entry</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="input-group">
                <label className="label">Profile</label>
                <select
                  className="select"
                  value={newEntryData.profileId}
                  onChange={(e) => setNewEntryData({ ...newEntryData, profileId: e.target.value, answers: {}, activityTag: undefined })}
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label className="label">Date & Time</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={newEntryData.phaseEndTime}
                  onChange={(e) => setNewEntryData({ ...newEntryData, phaseEndTime: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label className="label">Round Number</label>
                <input
                  type="number"
                  className="input"
                  min="1"
                  value={newEntryData.roundNumber}
                  onChange={(e) => setNewEntryData({ ...newEntryData, roundNumber: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="input-group">
                <label className="label">Phase Type</label>
                <select
                  className="select"
                  value={newEntryData.phaseType}
                  onChange={(e) => setNewEntryData({ ...newEntryData, phaseType: e.target.value as 'work' | 'break', answers: {} })}
                >
                  <option value="work">Work</option>
                  <option value="break">Break</option>
                </select>
              </div>
            </div>

            {selectedNewEntryProfile?.activityTags && selectedNewEntryProfile.activityTags.length > 0 && (
              <div className="input-group">
                <label className="label">Activity Tag</label>
                <select
                  className="select"
                  value={newEntryData.activityTag || ''}
                  onChange={(e) => setNewEntryData({ ...newEntryData, activityTag: e.target.value || undefined })}
                >
                  <option value="">None</option>
                  {selectedNewEntryProfile.activityTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="input-group">
              <label className="label">Notes</label>
              <textarea
                className="textarea"
                rows={3}
                value={newEntryData.notes}
                onChange={(e) => setNewEntryData({ ...newEntryData, notes: e.target.value })}
                placeholder="Add notes..."
              />
            </div>

            {relevantQuestions.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Questions:</div>
                {relevantQuestions.map(q => (
                  <div key={q.id} className="input-group mb-2">
                    <label className="label" style={{ fontSize: '13px' }}>{q.text}</label>
                    <select
                      className="select"
                      value={newEntryData.answers[q.id] || ''}
                      onChange={(e) => setNewEntryData({
                        ...newEntryData,
                        answers: { ...newEntryData.answers, [q.id]: e.target.value }
                      })}
                    >
                      <option value="">-- Select --</option>
                      {q.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setIsAddingEntry(false)}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleSaveNewEntry}>
                Save Entry
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="text-center" style={{ padding: '40px' }}>
            Loading logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center text-secondary" style={{ padding: '40px' }}>
            No logs found. Complete some sessions to see logs here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredLogs.map((log) => {
              const isEditing = editingLogId === log.id;
              const profile = profiles.find(p => p.id === log.profileId);

              return (
                <div key={log.id} className="card" style={{ marginBottom: 0 }}>
                  {isEditing && editFormData ? (
                    // Edit Mode
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '16px'
                      }}>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                            Editing: {log.phaseType === 'work' ? 'Work Phase' : 'Break Phase'} - Round {log.roundNumber}
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                            {getProfileName(log.profileId)}
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                          {formatDate(log.phaseEndTime)}
                        </div>
                      </div>

                      {/* Activity Tag Editor */}
                      {profile?.activityTags && profile.activityTags.length > 0 && (
                        <div className="input-group mb-3">
                          <label className="label" htmlFor={`edit-activity-${log.id}`}>Activity Tag</label>
                          <select
                            id={`edit-activity-${log.id}`}
                            className="select"
                            value={editFormData.activityTag || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, activityTag: e.target.value || undefined })}
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

                      {/* Notes Editor */}
                      <div className="input-group mb-3">
                        <label className="label" htmlFor={`edit-notes-${log.id}`}>Notes</label>
                        <textarea
                          id={`edit-notes-${log.id}`}
                          className="textarea"
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          rows={3}
                          placeholder="Add notes..."
                        />
                      </div>

                      {/* Answers Editor */}
                      {profile?.questions && profile.questions.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                            Answers:
                          </div>
                          {profile.questions.map((question) => {
                            const currentAnswer = editFormData.answers[question.id] || '';

                            return (
                              <div key={question.id} className="input-group mb-2">
                                <label className="label" style={{ fontSize: '13px' }} htmlFor={`edit-answer-${log.id}-${question.id}`}>
                                  {question.text}
                                </label>
                                <select
                                  id={`edit-answer-${log.id}-${question.id}`}
                                  className="select"
                                  value={currentAnswer}
                                  onChange={(e) => setEditFormData({
                                    ...editFormData,
                                    answers: { ...editFormData.answers, [question.id]: e.target.value }
                                  })}
                                >
                                  <option value="">-- Select --</option>
                                  {question.options.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Edit Actions */}
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleSaveEdit}>
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '12px'
                      }}>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                            {log.phaseType === 'work' ? 'Work Phase' : 'Break Phase'} - Round {log.roundNumber}
                            {log.activityTag && (
                              <span style={{
                                marginLeft: '8px',
                                padding: '2px 8px',
                                backgroundColor: 'var(--primary-color)',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '14px',
                                fontWeight: '500'
                              }}>
                                {log.activityTag}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                            {getProfileName(log.profileId)}
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                          {formatDate(log.phaseEndTime)}
                        </div>
                      </div>

                      {log.notes && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                            Notes:
                          </div>
                          <div style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'pre-wrap'
                          }}>
                            {log.notes}
                          </div>
                        </div>
                      )}

                      {Object.keys(log.answers).length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                            Answers:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {Object.entries(log.answers).map(([questionId, answer]) => {
                              const question = profile?.questions.find(q => q.id === questionId);
                              const questionText = question?.text || `Question ${questionId}`;

                              return (
                                <div
                                  key={questionId}
                                  style={{
                                    fontSize: '13px',
                                    display: 'flex',
                                    gap: '8px'
                                  }}
                                >
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    {questionText}:
                                  </span>
                                  <span style={{ fontWeight: '500' }}>
                                    {answer}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleEditLog(log)}
                          style={{ fontSize: '13px', padding: '4px 12px' }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteLog(log.id)}
                          style={{ fontSize: '13px', padding: '4px 12px' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
