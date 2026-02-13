import { useState, useEffect } from 'react';
import type { Profile, Question } from '../types/pomodoro';
import { StorageService } from '../services/storage';

const TAG_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#22d3ee', '#818cf8', '#c084fc', '#f472b6'];

interface ProfileManagerProps {
  currentProfile: Profile;
  onProfileChange: (profile: Profile) => void;
}

export function ProfileManager({ currentProfile, onProfileChange }: ProfileManagerProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const loadedProfiles = await StorageService.getProfiles();
    setProfiles(loadedProfiles);
  };

  const handleProfileSelect = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      await StorageService.setActiveProfileId(profileId);
      onProfileChange(profile);
    }
  };

  const handleCreateProfile = () => {
    const newProfile: Profile = {
      id: Date.now().toString(),
      name: 'New Profile',
      rounds: 16,
      workDuration: 50,
      breakDuration: 10,
      useEndTime: false,
      endTime: '23:00',
      activityTags: [],
      questions: [
        {
          id: Date.now().toString(),
          text: 'How was this session?',
          type: 'both',
          options: ['Great', 'Good', 'Okay', 'Poor']
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      autoStartTime: undefined,
      lastAutoStartDay: undefined,
    };
    setEditingProfile(newProfile);
    setIsEditing(true);
  };

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile({ ...profile });
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!editingProfile) return;

    editingProfile.updatedAt = new Date().toISOString();

    const existingIndex = profiles.findIndex(p => p.id === editingProfile.id);
    if (existingIndex >= 0) {
      await StorageService.updateProfile(editingProfile);
    } else {
      await StorageService.addProfile(editingProfile);
    }

    await loadProfiles();

    if (existingIndex === -1) {
      await StorageService.setActiveProfileId(editingProfile.id);
      onProfileChange(editingProfile);
    }

    if (editingProfile.id === currentProfile.id) {
      onProfileChange(editingProfile);
      await StorageService.setActiveProfileId(editingProfile.id);
    }

    setIsEditing(false);
    setEditingProfile(null);
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (profiles.length <= 1) return;
    await StorageService.deleteProfile(profileId);
    await loadProfiles();

    if (currentProfile.id === profileId) {
      const remaining = profiles.filter(p => p.id !== profileId);
      if (remaining.length > 0) {
        onProfileChange(remaining[0]);
      }
    }
  };

  const addQuestion = () => {
    if (!editingProfile) return;
    const newQuestion: Question = {
      id: Date.now().toString(),
      text: 'New Question',
      type: 'both',
      options: ['Option 1', 'Option 2', 'Option 3']
    };
    setEditingProfile({
      ...editingProfile,
      questions: [...editingProfile.questions, newQuestion]
    });
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    if (!editingProfile) return;
    const updatedQuestions = [...editingProfile.questions];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setEditingProfile({ ...editingProfile, questions: updatedQuestions });
  };

  const deleteQuestion = (index: number) => {
    if (!editingProfile) return;
    const updatedQuestions = editingProfile.questions.filter((_, i) => i !== index);
    setEditingProfile({ ...editingProfile, questions: updatedQuestions });
  };

  const updateQuestionOption = (questionIndex: number, optionIndex: number, value: string) => {
    if (!editingProfile) return;
    const updatedQuestions = [...editingProfile.questions];
    const options = [...updatedQuestions[questionIndex].options];
    options[optionIndex] = value;
    updatedQuestions[questionIndex] = { ...updatedQuestions[questionIndex], options };
    setEditingProfile({ ...editingProfile, questions: updatedQuestions });
  };

  const addQuestionOption = (questionIndex: number) => {
    if (!editingProfile) return;
    const updatedQuestions = [...editingProfile.questions];
    updatedQuestions[questionIndex].options.push('New Option');
    setEditingProfile({ ...editingProfile, questions: updatedQuestions });
  };

  const deleteQuestionOption = (questionIndex: number, optionIndex: number) => {
    if (!editingProfile) return;
    const updatedQuestions = [...editingProfile.questions];
    updatedQuestions[questionIndex].options = updatedQuestions[questionIndex].options.filter(
      (_, i) => i !== optionIndex
    );
    setEditingProfile({ ...editingProfile, questions: updatedQuestions });
  };

  const addActivityTag = () => {
    if (!editingProfile) return;
    const tags = editingProfile.activityTags || [];
    const usedColors = Object.values(editingProfile.tagColors || {});
    const unusedColors = TAG_COLORS.filter(c => !usedColors.includes(c));
    const randomColor = unusedColors.length > 0
      ? unusedColors[Math.floor(Math.random() * unusedColors.length)]
      : TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

    let newTagName = `Tag ${tags.length + 1}`;
    let counter = tags.length + 1;
    while (tags.includes(newTagName)) {
      counter++;
      newTagName = `Tag ${counter}`;
    }

    setEditingProfile({
      ...editingProfile,
      activityTags: [...tags, newTagName],
      tagColors: { ...(editingProfile.tagColors || {}), [newTagName]: randomColor }
    });
  };

  const updateActivityTag = (index: number, value: string) => {
    if (!editingProfile) return;
    const tags = [...(editingProfile.activityTags || [])];
    const oldTag = tags[index];
    tags[index] = value;

    let newGoals = editingProfile.goals;
    if (newGoals && newGoals[oldTag] !== undefined) {
      newGoals = { ...newGoals };
      const goalValue = newGoals[oldTag];
      delete newGoals[oldTag];
      if (value.trim()) {
        newGoals[value] = goalValue;
      }
    }

    let newColors = editingProfile.tagColors;
    if (newColors && newColors[oldTag] !== undefined) {
      newColors = { ...newColors };
      const colorValue = newColors[oldTag];
      delete newColors[oldTag];
      if (value.trim()) {
        newColors[value] = colorValue;
      }
    }
    setEditingProfile({ ...editingProfile, activityTags: tags, goals: newGoals, tagColors: newColors });
  };

  const updateActivityColor = (tag: string, color: string) => {
    if (!editingProfile) return;
    const newColors = { ...(editingProfile.tagColors || {}), [tag]: color };
    setEditingProfile({ ...editingProfile, tagColors: newColors });
  };

  const deleteActivityTag = (index: number) => {
    if (!editingProfile) return;
    const oldTag = (editingProfile.activityTags || [])[index];
    const tags = (editingProfile.activityTags || []).filter((_, i) => i !== index);

    let newGoals = editingProfile.goals;
    if (newGoals && oldTag && newGoals[oldTag] !== undefined) {
      newGoals = { ...newGoals };
      delete newGoals[oldTag];
    }

    let newColors = editingProfile.tagColors;
    if (newColors && oldTag && newColors[oldTag] !== undefined) {
      newColors = { ...newColors };
      delete newColors[oldTag];
    }

    setEditingProfile({ ...editingProfile, activityTags: tags, goals: newGoals, tagColors: newColors });
  };

  if (isEditing && editingProfile) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-display font-bold">Edit Profile</h2>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Profile Name</label>
            <input
              type="text"
              className="input-field w-full"
              value={editingProfile.name}
              onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Rounds</label>
              <input
                type="number"
                className="input-field w-full disabled:opacity-30"
                min="1"
                max="100"
                value={editingProfile.rounds}
                onChange={(e) =>
                  setEditingProfile({
                    ...editingProfile,
                    rounds: parseInt(e.target.value) || 1,
                  })
                }
                disabled={!!editingProfile.useEndTime}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Work (m)</label>
              <input
                type="number"
                className="input-field w-full"
                min="1"
                max="120"
                value={editingProfile.workDuration}
                onChange={(e) =>
                  setEditingProfile({
                    ...editingProfile,
                    workDuration: parseInt(e.target.value) || 1,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Break (m)</label>
              <input
                type="number"
                className="input-field w-full"
                min="0"
                max="960"
                value={editingProfile.breakDuration}
                onChange={(e) =>
                  setEditingProfile({
                    ...editingProfile,
                    breakDuration: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/5">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">Use End Time</p>
              <p className="text-xs text-mutedForeground">Calculate rounds automatically until target time.</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 accent-accent"
              checked={!!editingProfile.useEndTime}
              onChange={(e) =>
                setEditingProfile({
                  ...editingProfile,
                  useEndTime: e.target.checked,
                })
              }
            />
            {editingProfile.useEndTime && (
              <input
                type="time"
                className="input-field w-28 h-10 px-3 text-sm"
                value={editingProfile.endTime || '18:00'}
                onChange={(e) =>
                  setEditingProfile({
                    ...editingProfile,
                    endTime: e.target.value,
                  })
                }
              />
            )}
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/5">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">Auto Start Session</p>
              <p className="text-xs text-mutedForeground">Automatically start a session at a specific time.</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 accent-accent"
              checked={!!editingProfile.autoStartTime}
              onChange={(e) =>
                setEditingProfile({
                  ...editingProfile,
                  autoStartTime: e.target.checked ? (editingProfile.autoStartTime || '09:00') : undefined,
                })
              }
            />
            {editingProfile.autoStartTime && (
              <input
                type="time"
                className="input-field w-28 h-10 px-3 text-sm"
                value={editingProfile.autoStartTime}
                onChange={(e) =>
                  setEditingProfile({
                    ...editingProfile,
                    autoStartTime: e.target.value,
                  })
                }
              />
            )}
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Activity Tags & Session Targets</label>
              <button className="btn-secondary py-1.5 px-3 text-xs" onClick={addActivityTag}>+ Add Tag</button>
            </div>
            <div className="space-y-4">
              {(editingProfile.activityTags || []).map((tag, index) => (
                <div key={index} className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4 group">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      className="input-field flex-1 h-10"
                      value={tag}
                      placeholder="Tag name"
                      onChange={(e) => updateActivityTag(index, e.target.value)}
                    />
                    <div className="flex items-center bg-white/5 border border-white/5 rounded-lg h-10 px-2 min-w-[100px] justify-between">
                      {(() => {
                        const rawVal = editingProfile.goals?.[tag];
                        const isPercentage = typeof rawVal === 'string' && rawVal.endsWith('%');
                        const numVal = isPercentage
                          ? (rawVal as string).replace('%', '')
                          : (rawVal || '');

                        return (
                          <>
                            <input
                              type="number"
                              className="bg-transparent border-none focus:ring-0 text-right w-14 text-sm px-1 py-0"
                              value={numVal}
                              placeholder="0"
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const newGoals = { ...(editingProfile.goals || {}) };
                                if (isNaN(val) || val <= 0) delete newGoals[tag];
                                else newGoals[tag] = isPercentage ? `${val}%` : val;
                                setEditingProfile({ ...editingProfile, goals: newGoals });
                              }}
                            />
                            <button
                              className={`w-7 h-7 ml-1 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${isPercentage ? 'bg-accent text-accentForeground' : 'bg-white/10 text-mutedForeground'
                                }`}
                              onClick={() => {
                                const newGoals = { ...(editingProfile.goals || {}) };
                                const val = parseInt(String(numVal)) || 0;
                                newGoals[tag] = isPercentage ? val : `${val}%`;
                                setEditingProfile({ ...editingProfile, goals: newGoals });
                              }}
                            >
                              {isPercentage ? '%' : '#'}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                    <button className="text-mutedForeground hover:text-red-400 p-2" onClick={() => deleteActivityTag(index)}>×</button>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center pt-1 border-t border-white/5">
                    <span className="text-[10px] text-mutedForeground uppercase tracking-wider mr-2">Tag Color</span>
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`w-5 h-5 rounded-full transition-all ${editingProfile.tagColors?.[tag] === color ? 'scale-125 ring-2 ring-white/50' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => updateActivityColor(tag, color)}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Follow-up Questions</label>
              <button className="btn-secondary py-1.5 px-3 text-xs" onClick={addQuestion}>+ Add Question</button>
            </div>
            <div className="space-y-6">
              {editingProfile.questions.map((question, qIndex) => (
                <div key={question.id} className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input-field flex-1 h-10"
                      value={question.text}
                      onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
                      placeholder="Question text"
                    />
                    <select
                      className="input-field w-24 h-10 px-2 text-xs"
                      value={question.type}
                      onChange={(e) => updateQuestion(qIndex, 'type', e.target.value)}
                    >
                      <option value="work">Work</option>
                      <option value="break">Break</option>
                      <option value="both">Both</option>
                    </select>
                    <button className="text-mutedForeground hover:text-red-400 p-2" onClick={() => deleteQuestion(qIndex)}>×</button>
                  </div>
                  <div className="space-y-2 pl-4 border-l-2 border-white/5">
                    {question.options.map((option, oIndex) => (
                      <div key={oIndex} className="flex gap-2 items-center">
                        <input
                          type="text"
                          className="input-field flex-1 h-9 text-sm"
                          value={option}
                          onChange={(e) => updateQuestionOption(qIndex, oIndex, e.target.value)}
                        />
                        <button className="text-mutedForeground hover:text-red-400 px-2" onClick={() => deleteQuestionOption(qIndex, oIndex)}>×</button>
                      </div>
                    ))}
                    <button className="text-xs text-accent hover:underline pt-1" onClick={() => addQuestionOption(qIndex)}>+ Add option</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-white/5">
          <button className="btn-secondary flex-1" onClick={() => setIsEditing(false)}>Cancel</button>
          <button className="btn-primary flex-1" onClick={handleSaveProfile}>Save Changes</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Current Profile</label>
        <button className="text-xs text-accent hover:underline" onClick={handleCreateProfile}>+ New Profile</button>
      </div>

      <div className="space-y-4">
        <select
          className="input-field w-full text-center text-lg font-medium cursor-pointer"
          value={currentProfile.id}
          onChange={(e) => handleProfileSelect(e.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>

        <div className="text-center p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-sm text-mutedForeground">
            {currentProfile.useEndTime && currentProfile.endTime
              ? `Working until ${currentProfile.endTime}`
              : `${currentProfile.rounds} rounds of ${currentProfile.workDuration}/${currentProfile.breakDuration}m`}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="btn-secondary flex-1 text-sm py-2" onClick={() => handleEditProfile(currentProfile)}>
          Edit Settings
        </button>
        {profiles.length > 1 && (
          <button className="btn-secondary flex-none px-4 hover:border-red-500/50 hover:text-red-400" onClick={() => handleDeleteProfile(currentProfile.id)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
