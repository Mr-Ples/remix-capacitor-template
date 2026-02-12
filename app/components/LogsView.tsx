import { useState, useEffect } from 'react';
import type { SessionLog, Profile } from '../types/pomodoro';
import { StorageService } from '../services/storage';
import { exportLogs } from '../services/logExport';

interface LogsViewProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChange?: () => void;
}

export function LogsView({ isOpen, onClose, onDataChange }: LogsViewProps) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<SessionLog | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
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
  };

  const handleClearLogs = async () => {
    // if (confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
    await StorageService.clearSessionLogs();
    await loadLogs();
    onDataChange?.();
    // }
  };

  const getProfileName = (profileId: string): string => {
    const profile = profiles.find(p => p.id === profileId);
    return profile ? profile.name : 'Unknown Profile';
  };

  const getFilteredLogs = (): SessionLog[] => {
    if (selectedProfileId === 'all') {
      return logs;
    }
    return logs.filter(log => log.profileId === selectedProfileId);
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
    await StorageService.clearSessionLogs();
    for (const log of updatedLogs) {
      await StorageService.addSessionLog(log);
    }
    await loadLogs();
    onDataChange?.();
    // }
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
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={handleExportLogs}
                disabled={logs.length === 0}
              >
                Export Logs
              </button>
              <button
                className="btn btn-danger"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
              >
                Clear All Logs
              </button>
            </div>
          </div>
        </div>

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
