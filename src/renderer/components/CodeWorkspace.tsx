import { useEffect, useRef, useState } from 'react';
import CodeHistory from './CodeHistory';
import { CodeEditor, CodeDiff } from './MonacoSurface';
import {
  Check,
  Copy,
  FileCode2,
  GitCompareArrows,
  Undo2,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { Workspace } from '../hooks/useSession';
import { languages } from '../../shared/contracts';
import { extractProposal } from '../../shared/revision';
import { codingScript, type WorkspacePlan } from '../../shared/planning';
import AnswerContent from './AnswerContent';
import CodingGuide from './CodingGuide';
export default function CodeWorkspace({
  work,
  plans = [],
  close,
  expanded,
  toggleExpanded,
}: {
  work: Workspace;
  plans?: WorkspacePlan[];
  close: () => void;
  expanded: boolean;
  toggleExpanded: () => void;
}) {
  const [planId, setPlanId] = useState<string | null>(null);
  const plan = plans.find((item) => item.id === planId) ?? plans.at(-1);
  const planning = plan?.code ?? '';
  const [view, setView] = useState<
    'editor' | 'full' | 'diff' | 'history' | 'planning' | 'overview'
  >(plan?.overview ? 'overview' : planning ? 'planning' : work.proposal ? 'diff' : 'editor');
  const [compareWorking, setCompareWorking] = useState(false);
  const previousProposal = useRef(work.proposal);
  useEffect(() => {
    const hadProposal = !!previousProposal.current;
    const isNewProposal = !!work.proposal && work.proposal !== previousProposal.current;
    previousProposal.current = work.proposal;
    setView((current) => {
      if (isNewProposal && current !== 'history')
        return plan && work.doc.version === 0 && !hadProposal ? 'full' : 'diff';
      if ((current === 'diff' || current === 'full') && !work.proposal) return 'editor';
      return current;
    });
    setCompareWorking(false);
  }, [work.proposal]);
  useEffect(() => {
    if (!plan)
      setView((current) => (current === 'planning' || current === 'overview' ? 'editor' : current));
  }, [plan?.id]);
  const planningView = view === 'planning' || view === 'overview';
  const shownCode =
    (view === 'full' || view === 'diff') && work.proposal ? work.proposal.code : work.doc.code;
  const codeTurn = [...work.turns]
    .reverse()
    .find((turn) => turn.status === 'done' && extractProposal(turn.answer, 0)?.code === shownCode);
  const script = planningView ? plan?.script : codeTurn ? codingScript(codeTurn.answer) : '';
  const narrationOwner = planningView ? plan?.id : codeTurn?.id;
  const [focus, setFocus] = useState<{ line: number; request: number }>();
  const codeSurface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus)
      codeSurface.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [focus]);
  useEffect(() => setFocus(undefined), [shownCode, planning]);
  const stale = !!work.proposal && work.proposal.baseVersion !== work.doc.version;
  const baselineLabel =
    compareWorking || work.proposalBaseSource === 'working' ? 'Working code' : 'Previous proposal';
  const request = work.proposal
    ? [...work.turns]
        .reverse()
        .find(
          (turn) =>
            turn.status === 'done' && extractProposal(turn.answer, 0)?.code === work.proposal?.code,
        )?.question
    : undefined;
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
          className="icon-button code-expand"
          aria-label={expanded ? 'Restore code width' : 'Expand code workspace'}
          title={expanded ? 'Restore code width' : 'Give code more room'}
          aria-pressed={expanded}
          onClick={toggleExpanded}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
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
        {plan?.overview && (
          <button
            className={view === 'overview' ? 'selected' : ''}
            onClick={() => setView('overview')}
          >
            Overview
          </button>
        )}
        {planning && (
          <button
            className={view === 'planning' ? 'selected' : ''}
            onClick={() => setView('planning')}
          >
            Design / pseudocode
          </button>
        )}
        <button className={view === 'editor' ? 'selected' : ''} onClick={() => setView('editor')}>
          <FileCode2 size={14} /> Editor
        </button>
        {work.proposal && (
          <button className={view === 'full' ? 'selected' : ''} onClick={() => setView('full')}>
            Full code
          </button>
        )}
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
          aria-label={
            planningView
              ? 'Copy design notes'
              : view === 'editor'
                ? 'Copy working code'
                : 'Copy displayed code'
          }
          title={
            planningView
              ? 'Copy design notes'
              : view === 'editor'
                ? 'Copy working code'
                : 'Copy displayed code'
          }
          onClick={() =>
            void navigator.clipboard
              .writeText(
                view === 'planning'
                  ? planning
                  : view === 'overview'
                    ? (plan?.overview ?? '')
                    : shownCode,
              )
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
          disabled={planningView || view === 'history' || !work.doc.previous.length}
          onClick={work.undo}
        >
          <Undo2 size={16} />
        </button>
      </div>
      {work.proposal && view !== 'history' && !planningView && (
        <div className="proposal-context">
          {request && (
            <details className="proposal-request">
              <summary>Requested change</summary>
              <p>{request}</p>
            </details>
          )}
          <div className={`proposal-banner ${stale ? 'stale' : ''}`}>
            <GitCompareArrows size={16} />
            <span>
              {stale
                ? 'Your code changed. Generate a fresh proposal before applying.'
                : view === 'editor'
                  ? 'You are viewing your working code. The proposed changes are in Review changes.'
                  : work.proposalBaseSource === 'proposal' && !compareWorking
                    ? 'Changes since the previous proposal. Accept applies the full updated version.'
                    : 'Changes against your working code. Review before accepting.'}
            </span>
          </div>
          {view === 'diff' && work.proposalBaseSource === 'proposal' && (
            <label className="proposal-compare">
              <input
                type="checkbox"
                checked={compareWorking}
                onChange={(event) => setCompareWorking(event.target.checked)}
              />
              Compare all pending changes with working code
            </label>
          )}
        </div>
      )}
      {planningView && plans.length > 1 && (
        <label className="artifact-version">
          Design version
          <select
            aria-label="Design version"
            value={plan?.id}
            onChange={(event) => {
              setPlanId(event.target.value);
              const chosen = plans.find((item) => item.id === event.target.value);
              if (view === 'planning' && !chosen?.code) setView('overview');
            }}
          >
            {plans.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1} · {item.question.slice(0, 70)}
              </option>
            ))}
          </select>
        </label>
      )}
      {view !== 'history' && script && (
        <CodingGuide
          key={narrationOwner ?? 'planning'}
          script={script}
          code={planningView ? planning : shownCode}
          interrupted={!!narrationOwner && work.selected !== narrationOwner}
          resume={() => {
            if (narrationOwner) work.setSelected(narrationOwner);
          }}
          locate={(line) =>
            setFocus((previous) => ({ line, request: (previous?.request ?? 0) + 1 }))
          }
        />
      )}
      <div className="editor-wrap" ref={codeSurface}>
        {view === 'overview' ? (
          <div className="workspace-overview markdown">
            <AnswerContent text={plan?.overview ?? ''} />
          </div>
        ) : view === 'full' && work.proposal ? (
          <pre className="planning-code" aria-label="Full proposed code">
            {work.proposal.code.split('\n').map((line, index) => (
              <span
                className={focus?.line === index + 1 ? 'coding-active-line' : ''}
                data-active={focus?.line === index + 1}
                key={index}
              >
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        ) : view === 'planning' ? (
          <pre className="planning-code" aria-label="Design pseudocode">
            {planning.split('\n').map((line, index) => (
              <span
                className={focus?.line === index + 1 ? 'coding-active-line' : ''}
                data-active={focus?.line === index + 1}
                key={index}
              >
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        ) : view === 'history' ? (
          <CodeHistory work={work} />
        ) : view === 'diff' && work.proposal ? (
          <CodeDiff
            original={compareWorking ? work.doc.code : work.proposalBase}
            modified={work.proposal.code}
            language={work.settings.language}
            originalLabel={baselineLabel}
            modifiedLabel="Proposed code"
            focus={focus}
          />
        ) : (
          <CodeEditor
            value={work.doc.code}
            language={work.settings.language}
            onChange={work.setCode}
            focus={focus}
          />
        )}
      </div>
      {planningView && <div className="code-footer">Planning only · working code is unchanged</div>}
      {view !== 'history' && !planningView && (
        <div className="code-footer">
          {work.proposal ? (
            <>
              <span className="diff-key">
                <i className="added" /> added <i className="removed" /> removed
              </span>
              <div className="spacer" />
              <button
                className="dark-button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(work.proposal!.code)
                    .then(() => work.setNotice('Proposed code copied'))
                    .catch(() =>
                      work.setError(
                        'Could not copy the proposal. Select the code and copy it manually.',
                      ),
                    )
                }
              >
                <Copy size={14} />
                Copy proposed code
              </button>
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
