import { useEffect, useState } from 'react';
import CodeHistory from './CodeHistory';
import { CodeEditor, CodeDiff } from './MonacoSurface';
import { Check, Copy, FileCode2, GitCompareArrows, Undo2, X } from 'lucide-react';
import type { Workspace } from '../hooks/useSession';
import { languages } from '../../shared/contracts';
export default function CodeWorkspace({ work, close }: { work: Workspace; close: () => void }) {
  const [view, setView] = useState<'editor' | 'diff' | 'history'>('editor');
  useEffect(() => {
    setView((current) => (current === 'history' ? current : work.proposal ? 'diff' : 'editor'));
  }, [work.proposal]);
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
        <button
          className="icon-button"
          aria-label="Close code workspace"
          title="Hide code without discarding it"
          onClick={close}
        >
          <X size={16} />
        </button>
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
        <button className={view === 'history' ? 'selected' : ''} onClick={() => setView('history')}>
          History
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
          disabled={view === 'history' || !work.doc.previous.length}
          onClick={work.undo}
        >
          <Undo2 size={16} />
        </button>
      </div>
      {work.proposal && view !== 'history' && (
        <div className={`proposal-banner ${stale ? 'stale' : ''}`}>
          <GitCompareArrows size={16} />
          <span>
            {stale
              ? 'Your code changed. Generate a fresh proposal before applying.'
              : work.proposalBaseSource === 'proposal'
                ? 'Changes since the previous proposal. Accept applies the full updated version.'
                : 'Changes against your working code. Review before accepting.'}
          </span>
        </div>
      )}
      <div className="editor-wrap">
        {view === 'history' ? (
          <CodeHistory work={work} />
        ) : view === 'diff' && work.proposal ? (
          <CodeDiff
            original={work.proposalBase}
            modified={work.proposal.code}
            language={work.settings.language}
          />
        ) : (
          <CodeEditor
            value={work.doc.code}
            language={work.settings.language}
            onChange={work.setCode}
          />
        )}
      </div>
      {view !== 'history' && (
        <div className="code-footer">
          {work.proposal ? (
            <>
              <span className="diff-key">
                <i className="added" /> added <i className="removed" /> removed
              </span>
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
      )}
    </section>
  );
}
