import { expect, it } from 'vitest';
import { composeAnswerContext, formatAnswerContext, isStoryFollowUp } from '../src/main/assistant';
import { inferPrinciples, selectStories } from '../src/shared/story-bank';
import { buildInstructions } from '../src/shared/prompts';
import { answerRequestSchema, settingsSchema } from '../src/shared/contracts';

const stories = [
  {
    id: 'fast-call',
    title: 'Shipped the fix before the data was complete',
    principles: ['Bias for Action' as const],
    action: 'I rolled out a feature flag and monitored error rates.',
    result: 'Errors dropped 40% within a day.',
  },
  {
    id: 'mentor',
    title: 'Helped a new teammate ramp up',
    principles: ['Hire and Develop the Best' as const],
    action: 'I paired with them on their first two tickets.',
  },
  {
    id: 'pipeline',
    title: 'Rebuilt the ingestion pipeline',
    principles: ['Invent and Simplify' as const, 'Ownership' as const],
    action: 'I replaced three cron jobs with one event-driven job.',
    result: 'Run time went from 2 hours to 15 minutes.',
  },
  {
    id: 'weekend',
    title: 'Fixed a broken handoff nobody owned',
    principles: ['Ownership' as const],
    action: 'I took on the on-call gap and wrote the runbook.',
  },
];
const settings = settingsSchema.parse({ stories });
const request = (
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
) =>
  answerRequestSchema.parse({
    id: 'b',
    question,
    code: '',
    codeVersion: 0,
    language: 'python',
    history,
  });

it('infers the principle Amazon phrasings probe even when it is not named', () => {
  expect(
    inferPrinciples('Tell me about a time you made a decision with incomplete data'),
  ).toContain('Bias for Action');
  expect(inferPrinciples('Describe a time you went above and beyond your role')).toContain(
    'Ownership',
  );
  expect(inferPrinciples('Tell me about a time you mentored someone')).toContain(
    'Hire and Develop the Best',
  );
});

it('picks the story tagged with the probed principle', () => {
  expect(
    selectStories(
      'Tell me about a time you had to decide with incomplete information',
      settings.stories,
    )[0].story.id,
  ).toBe('fast-call');
  expect(
    selectStories('Give me an example of when you simplified a process', settings.stories)[0].story
      .id,
  ).toBe('pipeline');
});

it('prefers a fresh story over one already told this session', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about a time you simplified a process' },
    { role: 'assistant' as const, content: 'I rebuilt our ingestion pipeline...' },
  ];
  const context = composeAnswerContext(
    request('Describe a time you went above and beyond your role', history),
    settings,
  );
  expect(context.relevantExperiences[0]).toContain('Fixed a broken handoff nobody owned');
  expect(context.storiesAlreadyTold).toEqual(['Rebuilt the ingestion pipeline']);
  expect(formatAnswerContext(context, ['behavioral'])).toContain(
    'Stories already told this session',
  );
});

it('keeps the probed story attached to Amazon deep-dive follow-ups', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about a time you simplified a process' },
    { role: 'assistant' as const, content: 'I rebuilt our ingestion pipeline...' },
  ];
  for (const probe of [
    'What would you do differently?',
    'What data did you use to decide?',
    'Who else was involved?',
    'Looking back, anything you regret?',
  ]) {
    expect(isStoryFollowUp(probe)).toBe(true);
    const context = composeAnswerContext(request(probe, history), settings);
    expect(context.isStoryFollowUp).toBe(true);
    expect(context.relevantExperiences[0]).toContain('2 hours to 15 minutes');
  }
  expect(isStoryFollowUp('Now write a function to merge two sorted arrays')).toBe(false);
});

it('pitches the voice at the chosen experience level instead of a fixed junior voice', () => {
  const mid = buildInstructions(settingsSchema.parse({}), ['behavioral']);
  expect(mid).not.toMatch(/junior developer/i);
  expect(mid).toMatch(/mid-level engineer/);
  expect(mid).toMatch(/Amazon answer shape/);
  expect(buildInstructions(settingsSchema.parse({ seniority: 'senior' }), ['behavioral'])).toMatch(
    /senior engineer/,
  );
});
