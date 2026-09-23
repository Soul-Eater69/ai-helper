import { useState } from 'react';
import { codingBeats } from '../../shared/coding-beats';
import AnswerContent from './AnswerContent';
export default function CodingGuide({
  script,
  code,
  interrupted,
  resume,
  locate,
}: {
  script: string;
  code: string;
  interrupted: boolean;
  resume: () => void;
  locate: (line: number) => void;
}) {
  const steps = codingBeats(script, code);
  const [index, setIndex] = useState(0);
  const position = Math.min(index, Math.max(0, steps.length - 1));
  const step = steps[position];
  if (!step) return null;
  return (
    <section className="coding-guide" aria-label="Coding narration">
      <div className="coding-guide-heading">
        <strong>Say while writing</strong>
        <span>
          {position + 1} / {steps.length}
        </span>
      </div>
      <div className="coding-script-body markdown">
        <strong>{step.label}</strong>
        <AnswerContent text={step.speech} />
      </div>
      <div className="coding-guide-controls">
        <button disabled={position === 0} onClick={() => setIndex(position - 1)}>
          Previous step
        </button>
        <button disabled={position === steps.length - 1} onClick={() => setIndex(position + 1)}>
          Next step
        </button>
        {step.line !== undefined && (
          <button onClick={() => locate(step.line!)}>Show in code</button>
        )}
        {interrupted && <button onClick={resume}>Back to implementation</button>}
      </div>
    </section>
  );
}
