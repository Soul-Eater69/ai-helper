import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { parseVisualTrace, traceStateAsNotes, type VisualTrace } from '../../shared/visual-trace';
import TraceDiagram from './TraceDiagram';
import TraceNotebook from './TraceNotebook';

function Walkthrough({ trace }: { trace: VisualTrace }) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<'notes' | 'walkthrough'>('notes');
  const step = trace.steps[Math.min(index, trace.steps.length - 1)];
  return (
    <section className="visual-dry-run" aria-label={`Visual dry run: ${trace.title}`}>
      <header className="trace-header">
        <span className="trace-kicker">Manual dry run</span>
        <h3>{trace.title}</h3>
        <p className="trace-input">Input: {trace.input}</p>
        <div className="trace-view-switch" role="group" aria-label="Dry run view">
          <button type="button" aria-pressed={view === 'notes'} onClick={() => setView('notes')}>
            Notes
          </button>
          <button
            type="button"
            aria-pressed={view === 'walkthrough'}
            onClick={() => setView('walkthrough')}
          >
            Walkthrough
          </button>
        </div>
      </header>
      {view === 'notes' ? (
        <TraceNotebook trace={trace} />
      ) : (
        <>
          <div className="trace-body">
            <div className="trace-step-label">
              Step {index + 1} of {trace.steps.length}
            </div>
            <h4>{step.title}</h4>
            <div className="trace-scene">
              {trace.nodes.length > 0 && <TraceDiagram trace={trace} step={step} />}
              {step.collections.length > 0 && (
                <div className="trace-collections">
                  {step.collections.map((collection, i) => (
                    <div key={i}>
                      <div className="trace-label">{collection.label}</div>
                      <ol>
                        {collection.items.length ? (
                          collection.items.map((item, j) => <li key={j}>{item}</li>)
                        ) : (
                          <li className="trace-empty">Empty</li>
                        )}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {trace.nodes.length > 0 && (
              <div className="trace-legend">
                <span>◎ Current / used</span>
                <span>✓ Done</span>
                <span>╱ Removed</span>
              </div>
            )}
            <div className="trace-notes" aria-live="polite" aria-atomic="true">
              <div>
                <span className="trace-label">Say this</span>
                <p className="trace-speech">{step.say}</p>
              </div>
              <div>
                <span className="trace-label">Write / mark</span>
                <pre className="trace-write">{step.write}</pre>
              </div>
            </div>
          </div>
          <footer className="trace-controls">
            <span>One decision at a time</span>
            <div>
              <button
                className="subtle"
                type="button"
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <button
                className="primary small"
                type="button"
                disabled={index >= trace.steps.length - 1}
                onClick={() => setIndex((i) => Math.min(trace.steps.length - 1, i + 1))}
              >
                Next step
                <ArrowRight size={14} />
              </button>
            </div>
          </footer>
          <details className="trace-all-notes">
            <summary>All walkthrough notes</summary>
            {trace.steps.map((item, i) => (
              <section key={i}>
                <h4>
                  {i + 1}. {item.title}
                </h4>
                <p>{item.say}</p>
                <pre>{item.write}</pre>
                {traceStateAsNotes(trace, item) && <pre>{traceStateAsNotes(trace, item)}</pre>}
              </section>
            ))}
          </details>
        </>
      )}
    </section>
  );
}

export default function VisualDryRun({
  source,
  streaming = false,
}: {
  source: string;
  streaming?: boolean;
}) {
  const trace = useMemo(() => parseVisualTrace(source), [source]);
  if (!trace)
    return (
      <aside className="trace-fallback" role="status">
        {streaming
          ? 'Preparing the visual walkthrough…'
          : 'This walkthrough could not be drawn. Ask to regenerate the dry run.'}
        {!streaming && (
          <details>
            <summary>View original walkthrough data</summary>
            <pre>{source}</pre>
          </details>
        )}
      </aside>
    );
  // A changed payload resets navigation; unrelated parent renders preserve the selected step.
  return <Walkthrough key={source} trace={trace} />;
}
