import { useState, useEffect, useCallback } from 'react';
import type { ActivityItem } from '../types/pomodoro';
import { StorageService } from '../services/storage';

interface ActivityNotesPanelProps {
  profileId: string;
  activityTag: string;
  tagColor?: string;
  /** When true, only render the form + list (no card/header). For use inside a modal. */
  embedded?: boolean;
}

export function ActivityNotesPanel({ profileId, activityTag, tagColor, embedded }: ActivityNotesPanelProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<'note' | 'task'>('task');
  const [expanded, setExpanded] = useState(true);

  const loadItems = useCallback(async () => {
    const list = await StorageService.getActivityItems(profileId, activityTag);
    setItems(list);
  }, [profileId, activityTag]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleAdd = async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    await StorageService.addActivityItem({
      id: Date.now().toString(),
      profileId,
      activityTag,
      type: newType,
      content: trimmed,
      ...(newType === 'task' && { completed: false }),
    });
    setNewContent('');
    loadItems();
  };

  const handleToggleTask = async (item: ActivityItem) => {
    if (item.type !== 'task') return;
    await StorageService.updateActivityItem({ ...item, completed: !item.completed });
    loadItems();
  };

  const handleDelete = async (id: string) => {
    await StorageService.deleteActivityItem(id);
    loadItems();
  };

  const tasks = items.filter((i) => i.type === 'task');
  const notes = items.filter((i) => i.type === 'note');

  const content = (
    <>
      <div className="flex gap-2">
            <input
              type="text"
              className="input-field flex-1 min-w-0 text-sm py-2"
              placeholder={newType === 'task' ? 'Add a task…' : 'Add a note…'}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button
                type="button"
                className={`px-2 text-xs ${newType === 'task' ? 'bg-accent/20 text-accent' : 'text-mutedForeground hover:bg-white/5'}`}
                onClick={() => setNewType('task')}
                title="Task"
              >
                Task
              </button>
              <button
                type="button"
                className={`px-2 text-xs ${newType === 'note' ? 'bg-accent/20 text-accent' : 'text-mutedForeground hover:bg-white/5'}`}
                onClick={() => setNewType('note')}
                title="Note"
              >
                Note
              </button>
            </div>
            <button
              type="button"
              className="btn-primary px-3 py-2 text-sm shrink-0"
              onClick={handleAdd}
              disabled={!newContent.trim()}
            >
              Add
            </button>
          </div>

          <ul className={`space-y-1.5 overflow-y-auto ${embedded ? 'flex-1 min-h-0' : 'max-h-48'}`}>
            {tasks.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 group text-sm py-1"
              >
                <button
                  type="button"
                  className="mt-0.5 shrink-0 w-4 h-4 rounded border border-white/20 flex items-center justify-center hover:border-accent transition-colors"
                  onClick={() => handleToggleTask(item)}
                  aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.completed && (
                    <span className="text-accent text-[10px]" aria-hidden>✓</span>
                  )}
                </button>
                <span
                  className={`flex-1 min-w-0 break-words ${item.completed ? 'line-through text-mutedForeground' : ''}`}
                >
                  {item.content}
                </span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 text-mutedForeground hover:text-red-400 transition-opacity p-0.5"
                  onClick={() => handleDelete(item.id)}
                  aria-label="Delete"
                >
                  ×
                </button>
              </li>
            ))}
            {notes.map((item) => (
              <li key={item.id} className="flex items-start gap-2 group text-sm py-1 pl-6">
                <span className="flex-1 min-w-0 break-words text-mutedForeground italic">
                  {item.content}
                </span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 text-mutedForeground hover:text-red-400 transition-opacity p-0.5"
                  onClick={() => handleDelete(item.id)}
                  aria-label="Delete"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
      {items.length === 0 && (
        <p className="text-xs text-mutedForeground py-2">
          No notes or tasks yet. Add a task or note above.
        </p>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-3 flex flex-col flex-1 min-h-0">{content}</div>;
  }

  return (
    <div className="w-full max-w-xs border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-sm font-medium flex items-center gap-2">
          {tagColor && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: tagColor }}
            />
          )}
          Notes & tasks
        </span>
        <span className="text-mutedForeground text-xs">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          {content}
        </div>
      )}
    </div>
  );
}
