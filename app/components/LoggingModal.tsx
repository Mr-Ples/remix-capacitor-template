import { useState } from 'react';
import type { Question, Profile, SessionLog } from '../types/pomodoro';

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (notes: string, answers: Record<string, string>, activityTag?: string) => void;
  onDelete: () => void;
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
  onDelete,
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

  const relevantQuestions = profile.questions;

  const handleSubmit = () => {
    onSubmit(notes, answers, activityTag || undefined);
    setNotes('');
    setAnswers({});
    setActivityTag('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-background/80 backdrop-blur-sm transition-all duration-300">
      <div
        className="glass-card w-full max-w-lg overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500"
      >
        <div className="p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
          <div className="space-y-1">
            <h2 className="text-xl font-display font-bold">
              Round Complete
            </h2>
            <p className="text-sm text-mutedForeground">
              Round <span className="text-foreground">{roundNumber}</span> of {totalRounds}
            </p>
          </div>

          <div className="space-y-6">
            {profile.activityTags && profile.activityTags.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground">Activity</label>
                  {activityTag && profile.tagColors?.[activityTag] && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: profile.tagColors[activityTag] }} />
                      <span className="text-[10px] text-mutedForeground">Color active</span>
                    </div>
                  )}
                </div>
                <select
                  className="input-field w-full appearance-none cursor-pointer"
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

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-mutedForeground px-1">Notes</label>
              <textarea
                className="input-field w-full h-24 py-3 resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What did you accomplish? Any thoughts?"
              />
            </div>

            {relevantQuestions.map((question) => (
              <div key={question.id} className="space-y-3">
                <label className="text-sm font-medium px-1">{question.text}</label>
                <div className="grid grid-cols-1 gap-2">
                  {question.options.map((option) => (
                    <button
                      key={option}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${answers[question.id] === option
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-white/5 bg-white/5 text-mutedForeground hover:bg-white/10'
                        }`}
                      onClick={() => setAnswers({ ...answers, [question.id]: option })}
                    >
                      <span className="text-sm">{option}</span>
                      {answers[question.id] === option && (
                        <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 flex gap-3">
            <button
              className="btn-secondary flex-1 py-4 text-lg"
              onClick={onDelete}
            >
              Delete
            </button>
            <button
              className="btn-primary flex-1 py-4 text-lg"
              onClick={handleSubmit}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
