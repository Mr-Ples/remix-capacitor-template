import { useState } from 'react';
import type { Question, Profile, SessionLog } from '../types/pomodoro';

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (notes: string, answers: Record<string, string>, activityTag?: string) => void;
  profile: Profile;
  phaseType: 'work' | 'break';
  roundNumber: number;
  totalRounds: number;
  currentActivityTag?: string;
}

export function LoggingModal({
  isOpen,
  onClose,
  onSubmit,
  profile,
  phaseType,
  roundNumber,
  totalRounds,
  currentActivityTag,
}: LoggingModalProps) {
  const [notes, setNotes] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activityTag, setActivityTag] = useState<string>(currentActivityTag || '');

  if (!isOpen) return null;

  const relevantQuestions = profile.questions.filter(
    q => q.type === phaseType || q.type === 'both'
  );

  const handleSubmit = () => {
    onSubmit(notes, answers, activityTag || undefined);
    setNotes('');
    setAnswers({});
    setActivityTag('');
  };

  const handleSkip = () => {
    onClose();
    setNotes('');
    setAnswers({});
    setActivityTag('');
  };

  return (
    <div className="modal-overlay" onClick={handleSkip}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {phaseType === 'work' ? 'Work Phase Complete' : 'Break Complete'}
          </h2>
          <button className="modal-close" onClick={handleSkip}>
            ×
          </button>
        </div>

        <p className="text-secondary mb-3">
          Round {roundNumber} of {totalRounds}
        </p>

        {profile.activityTags && profile.activityTags.length > 0 && (
          <div className="input-group">
            <label className="label">Activity Tag</label>
            <select
              className="select"
              value={activityTag}
              onChange={(e) => setActivityTag(e.target.value)}
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

        <div className="input-group">
          <label className="label">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you accomplish? Any thoughts?"
            rows={4}
          />
        </div>

        {relevantQuestions.map((question) => (
          <div key={question.id} className="input-group">
            <label className="label">{question.text}</label>
            <div className="radio-group">
              {question.options.map((option) => (
                <label
                  key={option}
                  className={`radio-option ${
                    answers[question.id] === option ? 'selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={answers[question.id] === option}
                    onChange={(e) =>
                      setAnswers({ ...answers, [question.id]: e.target.value })
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={handleSkip}>
            Skip
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Save Log
          </button>
        </div>
      </div>
    </div>
  );
}
