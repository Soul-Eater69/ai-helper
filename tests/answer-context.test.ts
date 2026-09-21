import { expect, it } from 'vitest';
import { composeAnswerContext } from '../src/main/assistant';
import { answerRequestSchema, settingsSchema } from '../src/shared/contracts';
const settings = settingsSchema.parse({
  stories: [
    {
      id: 'migration',
      title: 'Latency migration',
      keywords: 'latency migration',
      action: 'I added the index.',
      result: 'Latency fell to 210ms.',
    },
    {
      id: 'conflict',
      title: 'Cache disagreement',
      isConflict: true,
      action: 'I compared two designs.',
    },
  ],
});
const request = (
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
) =>
  answerRequestSchema.parse({
    id: 'a',
    question,
    code: 'print(1)',
    codeSource: 'proposal',
    codeVersion: 0,
    language: 'python',
    history,
  });
it('selects relevant real stories in main and preserves the code baseline', () => {
  const result = composeAnswerContext(
    request('Tell me about a time you improved latency'),
    settings,
  );
  expect(result.relevantExperiences.join(' ')).toContain('I added the index');
  expect(result.relevantExperiences.join(' ')).not.toContain('I compared two designs');
  expect(result.codeSource).toBe('proposal');
});
it('keeps story facts available on a follow-up but excludes them on a new technical problem', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about a time you improved latency' },
    { role: 'assistant' as const, content: 'I improved a database query.' },
  ];
  expect(
    composeAnswerContext(
      request('How did you measure that?', history),
      settings,
    ).relevantExperiences.join(' '),
  ).toContain('210ms');
  expect(
    composeAnswerContext(
      request('Design a latency optimized database migration service', history),
      settings,
    ).relevantExperiences,
  ).toEqual([]);
});
it('selects a new behavioral topic instead of reusing the previous story', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about a time you improved latency' },
    { role: 'assistant' as const, content: 'I improved a database query.' },
  ];
  const result = composeAnswerContext(
    request('How did you handle a disagreement with a difficult stakeholder?', history),
    settings,
  );
  expect(result.relevantExperiences.join(' ')).toContain('I compared two designs');
  expect(result.relevantExperiences.join(' ')).not.toContain('I added the index');
});
