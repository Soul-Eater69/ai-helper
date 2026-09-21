import { useEffect, useState } from 'react';
import { CodeEditor, CodeDiff, type DiffSummary } from './MonacoSurface';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCode2,
  GitCompareArrows,
  Undo2,
  X,
} from 'lucide-react';
import type { Workspace } from '../hooks/useSession';
import { languages } from '../../shared/contracts';
/** "line 14" or "lines 14-17", for the changed run as it appears in the proposal. */
function describe(region: { start: number; end: number }): string {
  return region.end > region.start ? `${region.start}-${region.end}` : `${region.start}`;
}

export default function CodeWorkspace({ work }: { work: Workspace }) {
  const [view, setView] = useState<'editor' | 'diff'>('editor');
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  useEffect(() => {
    if (work.proposal) setView('diff');
    else setView('editor');
    // A new proposal is a new set of changes; drop what the last one reported.
    setSummary(null);
    setFocusIndex(0);
  }, [work.proposal]);
  const regions = summary?.regions ?? [];
  const step = (by: number) =>
    setFocusIndex((current) => (current + by + regions.length) % Math.max(regions.length, 1));
  const stale = !!work.proposal && work.proposal.baseVersion !== work.doc.version;
  return (
    <section className="code-panel" aria-label="Code workspace">
      <div className="code-toolbar">
        <span className="code-title">
          <FileCode2 size={16} /> Code workspace{' '}
          <span className="version">v{work.doc.version}</span>
        </span>
        <select
          aria-label="Code language"
          value={work.settings.language}
          disabled={work.busy || !!work.proposal}
          onChange={(event) =>
            work.setSettings({
              ...work.settings,
              language: event.target.value as (typeof languages)[number],
            })
          }
        >
          {languages.map((lang) => (
            <option key={lang}>{lang}</option>
          ))}
        </select>
      </div>
      <div className="code-tabs">
        <button className={view === 'editor' ? 'selected' : ''} onClick={() => setView('editor')}>
          <FileCode2 size={14} /> Editor
        </button>
        <button
          className={view === 'diff' ? 'selected' : ''}
          disabled={!work.proposal}
          onClick={() => setView('diff')}
        >
          <GitCompareArrows size={14} /> Review changes{' '}
          {work.proposal && <span className="tab-dot" />}
        </button>
        <div className="spacer" />
        <button
          aria-label="Copy working code"
          title="Copy working code"
          onClick={() =>
            void navigator.clipboard
              .writeText(work.doc.code)
              .then(() => work.setNotice('Code copied'))
              .catch(() =>
                work.setError('Clipboard access failed. Select and copy the code manually.'),
              )
          }
        >
          <Copy size={15} />
        </button>
        <button
          aria-label="Undo revision"
          title="Undo last accepted revision"
          disabled={!work.doc.previous.length}
          onClick={work.undo}
        >
          <Undo2 size={16} />
        </button>
      </div>
      {work.proposal && (
        <div className={`proposal-banner ${stale ? 'stale' : ''}`}>
          <GitCompareArrows size={16} />
          <span>
            {stale
              ? 'Your code changed. Generate a fresh proposal before applying.'
              : 'A new version is ready. Review it before replacing your code.'}
          </span>
        </div>
      )}
      <div className="editor-wrap">
        {view === 'diff' && work.proposal ? (
          <CodeDiff
            original={work.proposalBase}
            modified={work.proposal.code}
            language={work.settings.language}
            onSummary={setSummary}
            focusIndex={focusIndex}
          />
        ) : (
          <CodeEditor
            value={work.doc.code}
            language={work.settings.language}
            onChange={work.setCode}
          />
        )}
      </div>
      <div className="code-footer">
        {work.proposal ? (
          <>
            <span className="diff-key" data-testid="diff-summary">
              {summary === null ? (
                'Comparing…'
              ) : regions.length === 0 ? (
                'No change to your code'
              ) : (
                <>
                  <i className="added" />+{summary.added}
                  <i className="removed" />-{summary.removed}
                  <span className="diff-where">
                    {regions.length === 1
                      ? `${regions[0].end > regions[0].start ? 'lines' : 'line'} ${describe(regions[0])}`
                      : `${regions.length} places: ${regions
                          .slice(0, 3)
                          .map(describe)
                          .join(', ')}${regions.length > 3 ? '…' : ''}`}
                  </span>
                </>
              )}
            </span>
            {regions.length > 1 && (
              <span className="diff-nav">
                <button aria-label="Previous change" onClick={() => step(-1)}>
                  <ChevronUp size={14} />
                </button>
                <span>
                  {focusIndex + 1}/{regions.length}
                </span>
                <button aria-label="Next change" onClick={() => step(1)}>
                  <ChevronDown size={14} />
                </button>
              </span>
            )}
            <div className="spacer" />
            <button className="dark-button" onClick={work.reject}>
              <X size={14} /> Reject
            </button>
            <button className="primary small" disabled={stale} onClick={work.accept}>
              <Check size={15} /> Accept changes
            </button>
          </>
        ) : (
          <>
            <span>
              <span className="green-dot" /> Your code · saved in this session
            </span>
            <span>{work.doc.code.split('\n').length} lines</span>
          </>
        )}
      </div>
    </section>
  );
}
