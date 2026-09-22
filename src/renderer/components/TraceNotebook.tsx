import { useState } from 'react';
import type { TraceStep, VisualTrace } from '../../shared/visual-trace';
import TraceDiagram from './TraceDiagram';

function stateNotes(trace: VisualTrace, step: TraceStep) {
  return [
    step.write,
    ...step.values.map(
      ({ id, value }) => `${trace.nodes.find((node) => node.id === id)?.label ?? id}: ${value}`,
    ),
    ...step.collections.map(({ label, items }) => `${label} = [${items.join(', ')}]`),
  ].join('\n');
}

export default function TraceNotebook({ trace }: { trace: VisualTrace }) {
  const [notice, setNotice] = useState('');
  async function copy(text: string, step: number) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Step ${step} notes copied`);
    } catch {
      setNotice('Could not copy. Select the notes and copy them manually.');
    }
  }
  return (
    <div className="trace-notebook">
      {trace.nodes.length > 0 && (
        <div className="trace-notebook-map">
          <span className="trace-label">Draw this · starting state</span>
          <TraceDiagram trace={trace} step={trace.steps[0]} />
        </div>
      )}
      {trace.steps.map((step, i) => (
        <section
          className="trace-notebook-step"
          key={i}
          aria-label={`Step ${i + 1}: ${step.title}`}
        >
          <h4>
            {i + 1}. {step.title}
          </h4>
          <div className="trace-note-heading">
            <span className="trace-label">Write / mark</span>
            <button
              type="button"
              className="subtle"
              aria-label={`Copy notes for step ${i + 1}`}
              onClick={() => copy(stateNotes(trace, step), i + 1)}
            >
              Copy
            </button>
          </div>
          <pre className="trace-notebook-write">{stateNotes(trace, step)}</pre>
          <span className="trace-label">Say this</span>
          <p className="trace-notebook-say">{step.say}</p>
        </section>
      ))}
      <p className="field-help" role="status">
        {notice}
      </p>
    </div>
  );
}
