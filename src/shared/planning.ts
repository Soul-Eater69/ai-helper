import { startsNewProblem } from './conversation';

/** Display-only planning notes must never become an executable code proposal. */
export function planningCode(answer: string): string {
  return [...answer.matchAll(/^```pseudocode\s*\r?\n([\s\S]*?)^```\s*$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .join('\n\n');
}

export interface WorkspacePlan {
  id: string;
  question: string;
  code: string;
  overview: string;
  script: string;
}

/** Keep completed artifacts, not the selected conversation turn. */
export function workspacePlans(
  turns: readonly { id: string; question: string; answer: string; status: string }[],
): WorkspacePlan[] {
  let plans: WorkspacePlan[] = [];
  for (const turn of turns) {
    if (startsNewProblem(turn.question)) plans = [];
    if (turn.status !== 'done') continue;
    const code = planningCode(turn.answer);
    const overview = designOverview(turn.answer);
    if (code || overview)
      plans.push({
        id: turn.id,
        question: turn.question,
        code: code || plans.at(-1)?.code || '',
        overview: overview || plans.at(-1)?.overview || '',
        script: codingScript(turn.answer),
      });
  }
  return plans;
}

function section(answer: string, names: string): string {
  const heading = new RegExp(`^#{1,3} (?:${names})[ \t]*\\r?$`, 'im').exec(answer);
  if (!heading) return '';
  const tail = answer.slice(heading.index + heading[0].length).trimStart();
  const end = tail.search(/^#{1,3} /m);
  return (end < 0 ? tail : tail.slice(0, end)).split(/^```/m)[0].trim();
}

export function designOverview(answer: string): string {
  return [
    'Entities',
    'Design notes',
    'Classes',
    'Core responsibilities',
    'Class overview',
    'Class design',
    'Methods',
  ]
    .map((name) => {
      const body = section(answer, name);
      return body ? `## ${name}\n\n${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Read-aloud text belongs to the artifact's producing turn, never a later follow-up. */
export function codingScript(answer: string): string {
  const explicit = section(answer, 'While coding|Coding narration');
  if (explicit) return explicit;
  const beforeCode = answer.split(/^```/m)[0];
  return beforeCode
    .split('\n')
    .filter((line) => /^>/.test(line))
    .join('\n')
    .trim();
}
