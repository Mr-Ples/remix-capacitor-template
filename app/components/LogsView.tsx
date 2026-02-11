import { useState, useEffect } from 'react';
import type { SessionLog, Profile } from '../types/pomodoro';
import { StorageService } from '../services/storage';

interface LogsViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LogsView({ isOpen, onClose }: LogsViewProps) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen]);

  const loadLogs = async () => {
    setLoading(true);
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
    if (confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      await StorageService.clearSessionLogs();
      await loadLogs();
    }
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

  if (!isOpen) return null;

  const filteredLogs = getFilteredLogs();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Session Logs</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="mb-3">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Filter by Profile</label>
              <select
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
            <div>
              <label className="label" style={{ visibility: 'hidden' }}>Action</label>
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
            {filteredLogs.map((log) => (
              <div key={log.id} className="card" style={{ marginBottom: 0 }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                      {log.phaseType === 'work' ? 'Work Phase' : 'Break Phase'} - Round {log.roundNumber}
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
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                      Answers:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {Object.entries(log.answers).map(([questionId, answer]) => {
                        // Try to find the question text from the profile
                        const profile = profiles.find(p => p.id === log.profileId);
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
              </div>
            ))}
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
