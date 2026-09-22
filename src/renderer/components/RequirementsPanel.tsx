import { useMemo, useState } from 'react';
import { currentRequirements, requirementsAsNotes } from '../../shared/requirements';
import type { Workspace } from '../hooks/useSession';

export default function RequirementsPanel({
  work,
  expanded,
  toggleExpanded,
}: {
  work: Workspace;
  expanded: boolean;
  toggleExpanded: () => void;
}) {
  const board = useMemo(() => currentRequirements(work.turns), [work.turns]);
  const [copied, setCopied] = useState('');
  const notes = board ? requirementsAsNotes(board) : '';
  return (
    <section className="requirements-panel" aria-label="Live requirements">
      <div className="requirements-panel-title">
        <strong>{board?.topic ?? 'Design notes'}</strong>
        <button
          type="button"
          className="subtle"
          disabled={!notes}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(notes);
              setCopied(notes);
            } catch {
              work.setError('Could not copy requirements. Please select the notes and copy them.');
            }
          }}
        >
          {notes && copied === notes ? 'Copied' : 'Copy notes'}
        </button>
      </div>
      <button
        type="button"
        className="subtle requirements-expand"
        aria-expanded={expanded}
        onClick={toggleExpanded}
      >
        {expanded ? 'Collapse notes' : 'Expand notes'}
      </button>
      <p className="field-help">Agreed points appear here as you go.</p>
      {(
        [
          ['Requirements', board?.requirements],
          ['Out of scope', board?.outOfScope],
        ] as const
      ).map(([title, points]) => (
        <div key={title}>
          <h3>{title}</h3>
          {points?.length ? (
            <ul>
              {points.map((point) => (
                <li key={`${board?.topic}:${point}`} className="requirement-point">
                  {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="requirements-empty">Nothing agreed yet.</p>
          )}
        </div>
      ))}
    </section>
  );
}
