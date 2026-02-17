import { ActivityNotesPanel } from './ActivityNotesPanel';

interface ActivityNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  activityTag: string;
  tagColor?: string;
  /** When true, show all items for the profile regardless of activity tag. */
  showAllItems?: boolean;
}

export function ActivityNotesModal({
  isOpen,
  onClose,
  profileId,
  activityTag,
  tagColor,
  showAllItems,
}: ActivityNotesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-background/80 backdrop-blur-sm transition-all duration-300">
      <div className="glass-card w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-300 min-h-[90vh] flex flex-col">
        <div className="p-4 sm:p-6 space-y-4 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-display font-bold flex items-center gap-2">
              {tagColor && !showAllItems && (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tagColor }}
                />
              )}
              {showAllItems ? 'All notes & tasks' : `Notes & tasks — ${activityTag}`}
            </h2>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <ActivityNotesPanel
            profileId={profileId}
            activityTag={activityTag}
            tagColor={tagColor}
            embedded
            showAllItems={showAllItems}
          />
        </div>
      </div>
    </div>
  );
}
