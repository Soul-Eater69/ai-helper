import { INITIAL_CODE, type Workspace } from '../hooks/useSession';

const actions = [
  {
    label: 'Explain approach',
    requiresCode: false,
    prompt:
      'Help me explain the current approach aloud in simple, natural first-person English. Include why it works and the main trade-off. Use our confirmed requirements; do not restart clarification or write code.',
  },
  {
    label: 'Dry run',
    requiresCode: false,
    prompt:
      'Give a manual dry run of the current code, or our agreed algorithm if code does not exist yet. Use the example we discussed, or a small illustrative input. Show important state changes and what I should explain aloud. Do not change or regenerate code.',
  },
  {
    label: 'Review code',
    requiresCode: true,
    prompt:
      'Review the current code against our confirmed requirements. Explain the most important correctness issue with a small counterexample, or explain why it works. Give concise feedback on edge cases, complexity and how to explain it. This is a manual review; do not rewrite code or claim to have executed tests.',
  },
  {
    label: 'Optimize',
    requiresCode: true,
    prompt:
      'Can we optimize the current code under our confirmed constraints? Explain the bottleneck, a justified improvement and its time/space trade-off in natural spoken English. If it is already optimal, explain why. Discuss the approach first and wait before writing replacement code.',
  },
];

export default function PracticeTools({ work }: { work: Workspace }) {
  const latest = work.turns.at(-1);
  if (!latest || work.demo || (work.selected && work.selected !== latest.id)) return null;
  const currentCode =
    work.proposal?.baseVersion === work.doc.version ? work.proposal.code : work.doc.code;
  const hasCode = !!currentCode.trim() && currentCode !== INITIAL_CODE;
  return (
    <details className="practice-tools">
      <summary>Practice tools</summary>
      <p>Use the latest conversation and code. Reviews and dry runs do not execute code.</p>
      <div className="practice-actions">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={work.busy || latest.status !== 'done' || (action.requiresCode && !hasCode)}
            title={action.requiresCode && !hasCode ? 'Add code to the workspace first' : undefined}
            onClick={() => void work.ask(action.prompt)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </details>
  );
}
