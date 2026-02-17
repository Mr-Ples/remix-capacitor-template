import { useState, useEffect, useCallback } from 'react';
import type { ActivityItem, Tag } from '../types/pomodoro';
import { StorageService } from '../services/storage';

interface ActivityNotesPanelProps {
  profileId: string;
  activityTag: string;
  tagColor?: string;
  /** When true, only render the form + list (no card/header). For use inside a modal. */
  embedded?: boolean;
  /** When true, show all items for the profile regardless of activity tag. */
  showAllItems?: boolean;
}

// Predefined color options for tags
const TAG_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#6B7280', // Gray
];

export function ActivityNotesPanel({ profileId, activityTag, tagColor, embedded, showAllItems }: ActivityNotesPanelProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<'note' | 'task'>('task');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  
  // Tag creation state
  const [showTagForm, setShowTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const loadItems = useCallback(async () => {
    let list: ActivityItem[];
    if (showAllItems) {
      list = await StorageService.getAllActivityItemsForProfile(profileId);
    } else {
      list = await StorageService.getActivityItems(profileId, activityTag);
    }
    setItems(list);
  }, [profileId, activityTag, showAllItems]);

  const loadTags = useCallback(async () => {
    const profileTags = await StorageService.getTagsForProfile(profileId);
    setTags(profileTags);
  }, [profileId]);

  useEffect(() => {
    loadItems();
    loadTags();
  }, [loadItems, loadTags]);

  const handleAdd = async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    await StorageService.addActivityItem({
      id: Date.now().toString(),
      profileId,
      activityTag,
      type: newType,
      content: trimmed,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      ...(newType === 'task' && { completed: false }),
    });
    setNewContent('');
    setSelectedTagIds([]);
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

  const handleAddTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    await StorageService.addTag({
      profileId,
      name: trimmed,
      color: newTagColor,
    });
    setNewTagName('');
    setNewTagColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
    setShowTagForm(false);
    loadTags();
  };

  const handleDeleteTag = async (tagId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await StorageService.deleteTag(tagId);
    loadTags();
    loadItems();
  };

  const toggleTagSelection = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const getTagById = (tagId: string): Tag | undefined => {
    return tags.find((t) => t.id === tagId);
  };

  // Format time only (no date)
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format full date for display in separators
  const formatDateSeparator = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Sort items by createdAt (newest first)
  const sortedItems = [...items].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const tagSelector = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
              selectedTagIds.includes(tag.id)
                ? 'ring-2 ring-white/30'
                : 'opacity-70 hover:opacity-100'
            }`}
            style={{ 
              backgroundColor: tag.color + '30',
              border: `1px solid ${tag.color}50`
            }}
            onClick={() => toggleTagSelection(tag.id)}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
            {selectedTagIds.includes(tag.id) && (
              <span className="ml-0.5">✓</span>
            )}
          </button>
        ))}
        {!showTagForm && (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-white/20 text-mutedForeground hover:border-white/40 hover:text-foreground transition-colors"
            onClick={() => setShowTagForm(true)}
          >
            + New tag
          </button>
        )}
      </div>
      
      {showTagForm && (
        <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
          <input
            type="text"
            className="input-field flex-1 min-w-0 text-xs py-1.5"
            placeholder="Tag name..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            autoFocus
          />
          <div className="flex gap-1">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`w-5 h-5 rounded-full transition-transform ${
                  newTagColor === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setNewTagColor(color)}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn-primary px-2 py-1 text-xs"
            onClick={handleAddTag}
            disabled={!newTagName.trim()}
          >
            Add
          </button>
          <button
            type="button"
            className="text-mutedForeground hover:text-foreground text-xs px-1"
            onClick={() => {
              setShowTagForm(false);
              setNewTagName('');
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );

  // State for editing tags on a specific item (just for opening the selector)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingTagIds, setEditingTagIds] = useState<string[]>([]);

  const startEditingTags = (item: ActivityItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditingTagIds(item.tagIds || []);
  };

  const cancelEditingTags = () => {
    setEditingItemId(null);
    setEditingTagIds([]);
  };

  const toggleEditingTag = async (tagId: string, item: ActivityItem) => {
    const newTagIds = editingTagIds.includes(tagId) 
      ? editingTagIds.filter((id) => id !== tagId)
      : [...editingTagIds, tagId];
    setEditingTagIds(newTagIds);
    // Auto-save immediately
    await StorageService.updateActivityItem({ ...item, tagIds: newTagIds });
    loadItems();
    // Close the editor after saving
    setEditingItemId(null);
    setEditingTagIds([]);
  };

  const renderItemTags = (item: ActivityItem) => {
    // If we're editing this item, show inline tag selector
    if (editingItemId === item.id) {
      return (
        <div className="flex flex-wrap gap-1 mt-1">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] transition-all ${
                editingTagIds.includes(tag.id)
                  ? 'ring-1 ring-white/50'
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={{ 
                backgroundColor: tag.color + '30',
                border: `1px solid ${tag.color}50`
              }}
              onClick={() => toggleEditingTag(tag.id, item)}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </button>
          ))}
          <button
            type="button"
            className="text-[10px] text-mutedForeground hover:text-foreground ml-1"
            onClick={cancelEditingTags}
          >
            ×
          </button>
        </div>
      );
    }
    
    return (
      <div className="flex flex-wrap gap-1 mt-1 items-center">
        {item.tagIds && item.tagIds.length > 0 ? (
          item.tagIds.map((tagId) => {
            const tag = getTagById(tagId);
            if (!tag) return null;
            return (
              <span
                key={tagId}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:opacity-80"
                style={{ 
                  backgroundColor: tag.color + '20',
                  color: tag.color
                }}
                onClick={(e) => startEditingTags(item, e)}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </span>
            );
          })
        ) : null}
        <button
          type="button"
          className="text-[10px] text-mutedForeground hover:text-foreground opacity-0 group-hover:opacity-100 ml-1"
          onClick={(e) => startEditingTags(item, e)}
          title="Add tags"
        >
          + Tag
        </button>
      </div>
    );
  };

  // Group items by date
  const itemsByDate: { [date: string]: ActivityItem[] } = {};
  sortedItems.forEach(item => {
    const dateKey = new Date(item.createdAt).toISOString().split('T')[0];
    if (!itemsByDate[dateKey]) {
      itemsByDate[dateKey] = [];
    }
    itemsByDate[dateKey].push(item);
  });

  const renderItem = (item: ActivityItem, showCheckbox: boolean) => (
    <li
      key={item.id}
      className="flex items-start gap-2 group text-sm py-1"
    >
      {showCheckbox && (
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
      )}
      <div className="flex-1 min-w-0">
        <span
          className={`break-words block ${item.completed ? 'line-through text-mutedForeground' : ''}`}
        >
          {item.content}
        </span>
        {renderItemTags(item)}
      </div>
      <span className="text-[10px] text-mutedForeground/50 shrink-0">{formatTime(item.createdAt)}</span>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 text-mutedForeground hover:text-red-400 transition-opacity p-0.5"
        onClick={() => handleDelete(item.id)}
        aria-label="Delete"
      >
        ×
      </button>
    </li>
  );

  const content = (
    <>
      <div className="space-y-2">
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

        {tagSelector}
      </div>

      <ul className={`space-y-1.5 overflow-y-auto ${embedded ? 'flex-1 min-h-0' : 'max-h-48'}`}>
        {Object.entries(itemsByDate).map(([date, dateItems]) => (
          <li key={date} className="list-none">
            {/* Date Separator */}
            <div className="flex items-center gap-4 py-2 mt-2 first:mt-0">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-accent/30 to-transparent"></div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-accent/90 px-3 py-1 rounded-lg bg-accent/10 border border-accent/20">
                {formatDateSeparator(dateItems[0].createdAt)}
              </h3>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-accent/30 to-transparent"></div>
            </div>
            
            {/* Items for this date */}
            <div className="space-y-1">
              {dateItems.map(item => {
                if (item.type === 'task') {
                  return renderItem(item, true);
                }
                return (
                  <li key={item.id} className="flex items-start gap-2 group text-sm py-1 pl-6">
                    <div className="flex-1 min-w-0">
                      <span className="break-words block text-mutedForeground italic">
                        {item.content}
                      </span>
                      {renderItemTags(item)}
                    </div>
                    <span className="text-[10px] text-mutedForeground/50 shrink-0">{formatTime(item.createdAt)}</span>
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 text-mutedForeground hover:text-red-400 transition-opacity p-0.5"
                      onClick={() => handleDelete(item.id)}
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </div>
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
