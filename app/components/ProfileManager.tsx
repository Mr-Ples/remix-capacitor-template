import { useState, useEffect } from 'react';
import type { Profile, Question } from '../types/pomodoro';
import { StorageService } from '../services/storage';

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
    setIsEditing(false);
    setEditingProfile(null);
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (profiles.length <= 1) {
      alert('Cannot delete the last profile');
      return;
    }
    
    if (confirm('Are you sure you want to delete this profile?')) {
      await StorageService.deleteProfile(profileId);
      await loadProfiles();
      
      if (currentProfile.id === profileId) {
        const remaining = profiles.filter(p => p.id !== profileId);
        if (remaining.length > 0) {
          onProfileChange(remaining[0]);
        }
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
    setEditingProfile({
      ...editingProfile,
      activityTags: [...tags, 'New Tag']
    });
  };

  const updateActivityTag = (index: number, value: string) => {
    if (!editingProfile) return;
    
    const tags = [...(editingProfile.activityTags || [])];
    tags[index] = value;
    setEditingProfile({ ...editingProfile, activityTags: tags });
  };

  const deleteActivityTag = (index: number) => {
    if (!editingProfile) return;
    
    const tags = (editingProfile.activityTags || []).filter((_, i) => i !== index);
    setEditingProfile({ ...editingProfile, activityTags: tags });
  };

  if (isEditing && editingProfile) {
    return (
      <div className="card">
        <h2 className="modal-title mb-3">Edit Profile</h2>
        
        <div className="input-group">
          <label className="label">Profile Name</label>
          <input
            type="text"
            className="input"
            value={editingProfile.name}
            onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
          />
        </div>

        <div className="flex gap-2 mb-3">
          <div className="input-group" style={{ flex: 1 }}>
            <label className="label">
              Rounds
              {editingProfile.useEndTime && (
                <span style={{ marginLeft: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  (calculated from end time)
                </span>
              )}
            </label>
            <input
              type="number"
              className="input"
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

          <div className="input-group" style={{ flex: 1 }}>
            <label className="label">Work (min)</label>
            <input
              type="number"
              className="input"
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

          <div className="input-group" style={{ flex: 1 }}>
            <label className="label">Break (min)</label>
            <input
              type="number"
              className="input"
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

        <div className="flex gap-2 mb-3">
          <div className="input-group" style={{ flex: 1 }}>
            <label className="label">Use End Time Instead of Fixed Rounds</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={!!editingProfile.useEndTime}
                onChange={(e) =>
                  setEditingProfile({
                    ...editingProfile,
                    useEndTime: e.target.checked,
                  })
                }
              />
              <span className="text-secondary" style={{ fontSize: '12px' }}>
                When enabled, rounds are calculated when you tap Start based on the end time.
              </span>
            </div>
          </div>

          <div className="input-group" style={{ flex: 1 }}>
            <label className="label">End Time (HH:MM)</label>
            <input
              type="time"
              className="input"
              value={editingProfile.endTime || '18:00'}
              onChange={(e) =>
                setEditingProfile({
                  ...editingProfile,
                  endTime: e.target.value,
                })
              }
            />
          </div>
        </div>

        <div className="mb-3">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label className="label" style={{ marginBottom: 0 }}>Activity Tags</label>
            <button className="btn btn-secondary" onClick={addActivityTag}>+ Add Tag</button>
          </div>
          <p className="text-secondary" style={{ fontSize: '12px', marginBottom: '12px' }}>
            Tags help categorize your work sessions (e.g., Coding, Reading, Meeting)
          </p>
          
          {(editingProfile.activityTags || []).length === 0 ? (
            <p className="text-secondary" style={{ fontSize: '14px', fontStyle: 'italic' }}>
              No tags yet. Click "+ Add Tag" to create one.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(editingProfile.activityTags || []).map((tag, index) => (
                <div key={index} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ width: '120px', padding: '6px 8px' }}
                    value={tag}
                    onChange={(e) => updateActivityTag(index, e.target.value)}
                  />
                  <button
                    className="btn btn-danger"
                    onClick={() => deleteActivityTag(index)}
                    style={{ padding: '6px 12px', fontSize: '14px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label className="label" style={{ marginBottom: 0 }}>Questions</label>
            <button className="btn btn-secondary" onClick={addQuestion}>+ Add Question</button>
          </div>

          {editingProfile.questions.map((question, qIndex) => (
            <div key={question.id} className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1 }}
                  value={question.text}
                  onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
                  placeholder="Question text"
                />
                <select
                  className="select"
                  style={{ width: '120px' }}
                  value={question.type}
                  onChange={(e) => updateQuestion(qIndex, 'type', e.target.value)}
                >
                  <option value="work">Work</option>
                  <option value="break">Break</option>
                  <option value="both">Both</option>
                </select>
                <button
                  className="btn btn-danger"
                  onClick={() => deleteQuestion(qIndex)}
                  style={{ padding: '8px 16px' }}
                >
                  ×
                </button>
              </div>

              <div>
                <label className="label" style={{ fontSize: '14px' }}>Options</label>
                {question.options.map((option, oIndex) => (
                  <div key={oIndex} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="input"
                      style={{ flex: 1 }}
                      value={option}
                      onChange={(e) => updateQuestionOption(qIndex, oIndex, e.target.value)}
                    />
                    <button
                      className="btn btn-danger"
                      onClick={() => deleteQuestionOption(qIndex, oIndex)}
                      style={{ padding: '8px 16px' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="btn btn-secondary"
                  onClick={() => addQuestionOption(qIndex)}
                  style={{ fontSize: '14px', padding: '6px 12px' }}
                >
                  + Add Option
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveProfile}>
            Save Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <label className="label" style={{ marginBottom: 0 }}>Select Profile</label>
        <button className="btn btn-secondary" onClick={handleCreateProfile}>
          + New Profile
        </button>
      </div>

      <select
        className="select mb-2"
        value={currentProfile.id}
        onChange={(e) => handleProfileSelect(e.target.value)}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}{' '}
            {profile.useEndTime && profile.endTime
              ? `(ends at ${profile.endTime}, ${profile.workDuration}/${profile.breakDuration} min)`
              : `(${profile.rounds} rounds, ${profile.workDuration}/${profile.breakDuration} min)`}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <button
          className="btn btn-secondary"
          onClick={() => handleEditProfile(currentProfile)}
        >
          Edit Profile
        </button>
        {profiles.length > 1 && (
          <button
            className="btn btn-danger"
            onClick={() => handleDeleteProfile(currentProfile.id)}
          >
            Delete Profile
          </button>
        )}
      </div>
    </div>
  );
}
