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
  const [selectedDate, setSelectedDate] = useState<string>('');
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
    phaseEndTime: new Date().toISOString().slice(0, 16),
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
      // Prevent background scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const loadLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    const loadedLogs = await StorageService.getSessionLogs();
    const loadedProfiles = await StorageService.getProfiles();
    loadedLogs.sort((a, b) => new Date(b.phaseEndTime).getTime() - new Date(a.phaseEndTime).getTime());
    setLogs(loadedLogs);
    setProfiles(loadedProfiles);
    setLoading(false);
    if (!newEntryData.profileId && loadedProfiles.length > 0) {
      const initialProfileId = defaultProfileId || loadedProfiles[0].id;
      setNewEntryData(prev => ({ ...prev, profileId: initialProfileId }));
    }
  };

  const handleClearLogs = async () => {
    const filteredLogs = getFilteredLogs();
    if (filteredLogs.length === 0) return;
    const filteredIds = new Set(filteredLogs.map(log => log.id));
    const updatedLogs = logs.filter(log => !filteredIds.has(log.id));
    await StorageService.saveSessionLogs(updatedLogs);
    await loadLogs();
    onDataChange?.();
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
    if (logsToExport.length === 0) return;
    try {
      await exportLogs(logsToExport);
    } catch (error) {
      console.error('Error exporting logs', error);
    }
  };

  const handleEditLog = (log: SessionLog) => {
    setEditingLogId(log.id);
    setEditFormData({ ...log });
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    await StorageService.updateSessionLog(editFormData);
    await loadLogs(true);
    onDataChange?.();
    setEditingLogId(null);
    setEditFormData(null);
  };

  const handleUpdateAnswer = (questionId: string, answer: string) => {
    if (!editFormData) return;
    setEditFormData({
      ...editFormData,
      answers: {
        ...editFormData.answers,
        [questionId]: answer
      }
    });
  };

  const handleDeleteLog = async (logId: string) => {
    const updatedLogs = logs.filter(log => log.id !== logId);
    await StorageService.saveSessionLogs(updatedLogs);
    await loadLogs();
    onDataChange?.();
  };

  const handleSaveNewEntry = async () => {
    if (!newEntryData.profileId) return;
    const logEntry: SessionLog = {
      id: Date.now().toString(),
      profileId: newEntryData.profileId,
      sessionStartTime: newEntryData.phaseEndTime,
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

  return (
    <div className="fixed inset-0 z-[100] flex flex-col p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="glass-card w-full max-w-4xl mx-auto flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-2xl font-display font-bold">Session Logs</h2>
          <button className="text-3xl leading-none text-mutedForeground hover:text-foreground" onClick={onClose}>×</button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Filters and Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Profile</label>
              <select
                className="input-field w-full appearance-none cursor-pointer"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
              >
                <option value="all">All Profiles</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Date</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input-field flex-1"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
                {selectedDate && (
                  <button className="btn-secondary px-3" onClick={() => setSelectedDate('')}>×</button>
                )}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button className="btn-primary flex-1 py-2 text-sm" onClick={() => setIsAddingEntry(true)}>Add</button>
              <button className="btn-secondary flex-1 py-2 text-sm" onClick={handleExportLogs}>Export</button>
              <button className="btn-secondary flex-1 py-2 text-sm text-red-400 border-red-500/20" onClick={handleClearLogs}>Clear</button>
            </div>
          </div>

          {isAddingEntry && (
            <div className="p-6 rounded-xl bg-accent/5 border border-accent/20 space-y-4 animate-in zoom-in-95 duration-200">
              <h3 className="font-medium">Add Manual Entry</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-mutedForeground">Profile</label>
                  <select
                    className="input-field w-full h-9 text-xs"
                    value={newEntryData.profileId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setNewEntryData({ ...newEntryData, profileId: pId, answers: {}, activityTag: undefined });
                    }}
                  >
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-mutedForeground">Time</label>
                  <input
                    type="datetime-local"
                    className="input-field w-full h-9 text-xs"
                    value={newEntryData.phaseEndTime}
                    onChange={(e) => setNewEntryData({ ...newEntryData, phaseEndTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-mutedForeground">Round</label>
                <input
                  type="number"
                  className="input-field w-full h-9 text-xs text-right"
                  min="1"
                  value={newEntryData.roundNumber}
                  onChange={(e) => setNewEntryData({ ...newEntryData, roundNumber: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-mutedForeground">Notes</label>
                <textarea
                  className="input-field w-full h-16 text-xs resize-none"
                  placeholder="Optional session notes..."
                  value={newEntryData.notes}
                  onChange={(e) => setNewEntryData({ ...newEntryData, notes: e.target.value })}
                />
              </div>

              {(() => {
                const profile = profiles.find(p => p.id === newEntryData.profileId);
                if (!profile?.activityTags || profile.activityTags.length === 0) return null;

                return (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-mutedForeground">Activity</label>
                    <select
                      className="input-field w-full h-9 text-xs"
                      value={newEntryData.activityTag || ''}
                      onChange={(e) => setNewEntryData({ ...newEntryData, activityTag: e.target.value || undefined })}
                    >
                      <option value="">None</option>
                      {profile.activityTags.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {newEntryData.profileId && (() => {
                const profile = profiles.find(p => p.id === newEntryData.profileId);
                const relevantQuestions = profile?.questions;
                if (!relevantQuestions || relevantQuestions.length === 0) return null;

                return (
                  <div className="space-y-3 pt-2 border-t border-accent/10">
                    <label className="text-[10px] uppercase tracking-widest text-mutedForeground">Questions</label>
                    <div className="space-y-3">
                      {relevantQuestions.map(q => (
                        <div key={q.id} className="space-y-1">
                          <p className="text-[11px] font-medium text-foreground/90">{q.text}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {q.options.map(opt => (
                              <button
                                key={opt}
                                className={`px-2 py-1 rounded text-[9px] transition-all ${newEntryData.answers[q.id] === opt
                                  ? 'bg-accent text-accentForeground font-bold'
                                  : 'bg-white/5 text-mutedForeground hover:bg-white/10'
                                  }`}
                                onClick={() => setNewEntryData({
                                  ...newEntryData,
                                  answers: { ...newEntryData.answers, [q.id]: opt }
                                })}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button className="btn-secondary flex-1 py-2 text-xs" onClick={() => setIsAddingEntry(false)}>Cancel</button>
                <button className="btn-primary flex-1 py-2 text-xs" onClick={handleSaveNewEntry}>Save Entry</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-mutedForeground animate-pulse">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-mutedForeground italic">No logs found matching filters.</div>
          ) : (
            <div className="space-y-4 pb-8">
              {filteredLogs.map(log => {
                const isEditing = editingLogId === log.id;
                const profile = profiles.find(p => p.id === log.profileId);

                return (
                  <div key={log.id} className={`p-4 rounded-xl border transition-all ${isEditing ? 'border-accent bg-accent/5' : 'border-white/5 bg-white/5 hover:bg-white-[0.08]'}`}>
                    {isEditing && editFormData ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-xs text-mutedForeground">
                          <span>Editing Round {log.roundNumber}</span>
                          <div className="flex gap-4">
                            <button onClick={() => setEditingLogId(null)} className="text-mutedForeground hover:text-foreground">Cancel</button>
                            <button onClick={handleSaveEdit} className="text-accent font-bold">Save Changes</button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <label className="text-[10px] uppercase tracking-widest text-mutedForeground">Notes</label>
                          <textarea
                            className="input-field w-full h-20 text-sm resize-none"
                            value={editFormData.notes}
                            onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          />
                        </div>

                        {profile && profile.activityTags && profile.activityTags.length > 0 && (
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-widest text-mutedForeground">Activity</label>
                            <select
                              className="input-field w-full h-9 text-sm"
                              value={editFormData.activityTag || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, activityTag: e.target.value || undefined })}
                            >
                              <option value="">None</option>
                              {profile.activityTags.map(tag => (
                                <option key={tag} value={tag}>{tag}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {profile && profile.questions.length > 0 && (
                          <div className="space-y-4 pt-2 border-t border-white/5">
                            <label className="text-[10px] uppercase tracking-widest text-mutedForeground">Follow-up Questions</label>
                            <div className="space-y-4">
                              {profile.questions
                                .map(q => (
                                  <div key={q.id} className="space-y-2">
                                    <p className="text-xs font-medium text-foreground/90">{q.text}</p>
                                    <div className="flex flex-wrap gap-2">
                                      {q.options.map(opt => (
                                        <button
                                          key={opt}
                                          className={`px-3 py-1.5 rounded-lg text-[10px] transition-all ${editFormData.answers[q.id] === opt
                                            ? 'bg-accent text-accentForeground font-bold shadow-glow-sm'
                                            : 'bg-white/5 text-mutedForeground hover:bg-white/10'
                                            }`}
                                          onClick={() => handleUpdateAnswer(q.id, opt)}
                                        >
                                          {opt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Round {log.roundNumber}</span>
                              {log.activityTag && (
                                <span className="text-[10px] text-mutedForeground bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                  {log.activityTag}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-mutedForeground">{getProfileName(log.profileId)}</p>
                          </div>
                          <span className="text-[10px] tabular-nums text-mutedForeground opacity-60">{formatDate(log.phaseEndTime)}</span>
                        </div>

                        {log.notes && (
                          <p className="text-sm text-foreground/80 pl-2 border-l border-white/10 leading-relaxed italic line-clamp-2 hover:line-clamp-none transition-all">
                            "{log.notes}"
                          </p>
                        )}

                        <div className="flex justify-between items-end pt-2 gap-4">
                          <div className="flex-1 space-y-2">
                            {Object.entries(log.answers).map(([qid, ans]) => {
                              const qText = profile?.questions.find(q => q.id === qid)?.text || "Question";
                              return (
                                <div key={qid} className="flex flex-col gap-0.5">
                                  <span className="text-[9px] uppercase tracking-wider text-mutedForeground/70">{qText}</span>
                                  <span className="text-[11px] font-medium text-foreground/90">{ans}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex gap-4 py-1 shrink-0">
                            <button onClick={() => handleEditLog(log)} className="text-[10px] uppercase tracking-widest text-accent font-bold">Edit</button>
                            <button onClick={() => handleDeleteLog(log.id)} className="text-[10px] uppercase tracking-widest text-red-400 font-bold">Delete</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/5 md:hidden">
          <button className="btn-primary w-full py-3" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
