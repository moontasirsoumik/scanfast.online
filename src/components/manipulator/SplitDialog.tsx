import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, TextInput } from '@carbon/react';
import { Add, TrashCan } from '@carbon/icons-react';
import type { PageData } from '@/services/pdf';
import type { SplitGroup } from '@/pages/ManipulatorPage';
import './SplitDialog.css';

interface SplitDialogProps {
  pages: PageData[];
  open: boolean;
  onClose: () => void;
  onSplit: (groups: SplitGroup[]) => void;
}

const MAX_GROUPS = 5;
const GROUP_COLORS = [
  'var(--cds-blue-60, #0f62fe)',
  'var(--cds-teal-50, #009d9a)',
  'var(--cds-purple-60, #8a3ffc)',
  'var(--cds-magenta-60, #d02670)',
  'var(--cds-cyan-50, #1192e8)'
];

/** Custom modal for splitting PDF pages into named groups */
export default function SplitDialog({ pages, open, onClose, onSplit }: SplitDialogProps) {
  const [groupNames, setGroupNames] = useState<string[]>(['Group 1', 'Group 2']);
  const [pageAssignments, setPageAssignments] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setGroupNames(['Group 1', 'Group 2']);
      setPageAssignments(pages.map(() => 0));
    }
  }, [open, pages]);

  const groups = useMemo<SplitGroup[]>(
    () => groupNames.map((name, gi) => ({
      name,
      pageIndices: pageAssignments.reduce<number[]>((acc, g, pi) => {
        if (g === gi) acc.push(pi);
        return acc;
      }, [])
    })),
    [groupNames, pageAssignments]
  );

  const groupsWithPages = useMemo(() => groups.filter(g => g.pageIndices.length > 0), [groups]);
  const canSplit = groupsWithPages.length >= 2;

  const addGroup = useCallback(() => {
    if (groupNames.length >= MAX_GROUPS) return;
    setGroupNames(prev => [...prev, `Group ${prev.length + 1}`]);
  }, [groupNames.length]);

  const removeGroup = useCallback((index: number) => {
    if (groupNames.length <= 2) return;
    setPageAssignments(prev => prev.map(g => {
      if (g === index) return 0;
      if (g > index) return g - 1;
      return g;
    }));
    setGroupNames(prev => prev.filter((_, i) => i !== index));
  }, [groupNames.length]);

  const updateGroupName = useCallback((index: number, value: string) => {
    setGroupNames(prev => prev.map((n, i) => (i === index ? value : n)));
  }, []);

  const cyclePageGroup = useCallback((pageIndex: number) => {
    setPageAssignments(prev =>
      prev.map((g, i) => (i === pageIndex ? (g + 1) % groupNames.length : g))
    );
  }, [groupNames.length]);

  const handleSplit = useCallback(() => {
    if (!canSplit) return;
    onSplit(groupsWithPages);
  }, [canSplit, groupsWithPages, onSplit]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleKeydown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="split-backdrop"
      role="dialog"
      aria-modal={true}
      aria-label="Split PDF"
      onClick={handleBackdropClick}
      onKeyDown={handleKeydown}
    >
      <div className="split-modal">
        <header className="split-header">
          <h2>Split PDF</h2>
          <p className="split-desc">Assign pages to output groups. Click a page to change its group.</p>
        </header>

        <div className="split-body">
          <section className="groups-panel">
            <h3 className="panel-title">Groups</h3>
            <div className="groups-list">
              {groupNames.map((name, gi) => (
                <div className="group-row" key={gi}>
                  <span
                    className="group-dot"
                    style={{ background: GROUP_COLORS[gi % GROUP_COLORS.length] }}
                  />
                  <TextInput
                    id={`group-name-${gi}`}
                    size="sm"
                    hideLabel
                    labelText="Group name"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateGroupName(gi, e.target.value)}
                  />
                  <span className="group-count">{groups[gi]?.pageIndices.length ?? 0}</span>
                  {groupNames.length > 2 && (
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={TrashCan}
                      iconDescription="Remove group"
                      hasIconOnly
                      onClick={() => removeGroup(gi)}
                    />
                  )}
                </div>
              ))}
            </div>
            {groupNames.length < MAX_GROUPS && (
              <Button kind="ghost" size="sm" renderIcon={Add} onClick={addGroup}>
                Add Group
              </Button>
            )}
          </section>

          <section className="pages-panel">
            <h3 className="panel-title">Pages</h3>
            <div className="pages-grid">
              {pages.map((page, pi) => (
                <button
                  key={page.id}
                  className="page-cell"
                  type="button"
                  onClick={() => cyclePageGroup(pi)}
                  aria-label={`Page ${pi + 1}, Group ${groupNames[pageAssignments[pi]]}`}
                >
                  <img
                    src={page.thumbnail}
                    alt={`Page ${pi + 1}`}
                    className="page-thumb"
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                  />
                  <span
                    className="group-badge"
                    style={{ background: GROUP_COLORS[pageAssignments[pi] % GROUP_COLORS.length] }}
                  >{pageAssignments[pi] + 1}</span>
                  <span className="page-num">{pi + 1}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="split-footer">
          <Button kind="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button kind="primary" size="sm" disabled={!canSplit} onClick={handleSplit}>Split</Button>
        </footer>
      </div>
    </div>
  );
}
