import { describe, expect, it } from 'vitest';
import {
  isBehaviouralQuestion,
  renderStory,
  scoreStory,
  selectStories,
} from '../src/shared/story-bank';
import { storySchema, type ExperienceStory } from '../src/shared/contracts';

const story = (over: Partial<ExperienceStory>): ExperienceStory =>
  storySchema.parse({ id: over.title ?? 'id', title: 'Untitled', ...over });

const migration = story({
  id: 'migration',
  title: 'Payments database migration',
  principles: ['Ownership', 'Dive Deep'],
  keywords: 'latency postgres migration oncall',
  situation: 'Checkout latency regressed after a schema change.',
  action: 'I traced it to a missing index and led the rollout.',
  result: 'p99 fell from 900ms to 210ms.',
});
const disagreement = story({
  id: 'disagreement',
  title: 'Disagreed on the caching strategy',
  principles: ['Have Backbone; Disagree and Commit'],
  keywords: 'cache redis design review',
  action: 'I argued for a simpler cache, then supported the other approach.',
  isConflict: true,
});
const outage = story({
  id: 'outage',
  title: 'I shipped a bad config and caused an outage',
  keywords: 'config deploy rollback',
  action: 'I rolled it back and added a validation step.',
  isFailure: true,
});
const bank = [migration, disagreement, outage];

describe('recognising what kind of question it is', () => {
  it('spots the usual behavioural openings', () => {
    for (const q of [
      'Tell me about a time you disagreed with someone',
      'Give me an example of when you took ownership',
      'How did you handle a missed deadline?',
    ])
      expect(isBehaviouralQuestion(q)).toBe(true);
  });

  it('does not treat a coding question as behavioural', () => {
    expect(isBehaviouralQuestion('Write a function that reverses a linked list')).toBe(false);
    expect(isBehaviouralQuestion('How would you design a rate limiter?')).toBe(false);
  });
});

describe('choosing which story to offer', () => {
  it('offers a genuine failure when a failure is asked for', () => {
    const [top] = selectStories('Tell me about a time you made a mistake', bank);
    expect(top.story.id).toBe('outage');
    expect(top.reasons.join(' ')).toMatch(/genuine failure/i);
  });

  it('offers the conflict story for a disagreement question', () => {
    const [top] = selectStories('Tell me about a time you disagreed with a teammate', bank);
    expect(top.story.id).toBe('disagreement');
  });

  it('matches on keywords the STAR text does not contain', () => {
    const [top] = selectStories('Tell me about a time you improved latency', bank);
    expect(top.story.id).toBe('migration');
  });

  it('sends nothing at all for a coding question', () => {
    // This is what keeps the whole bank out of every DSA turn.
    expect(selectStories('Solve two sum in linear time', bank)).toEqual([]);
    expect(selectStories('Design a parking lot', bank)).toEqual([]);
  });

  it('still answers a behavioural question when nothing matches', () => {
    // Offering something beats letting the model invent a story.
    const picked = selectStories('Tell me about a time you were curious', bank);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked[0].reasons.join(' ')).toMatch(/starting point/i);
  });

  it('prefers a fresh story when another one genuinely fits', () => {
    const secondFailure = story({
      id: 'estimate',
      title: 'I underestimated a migration and slipped the date',
      keywords: 'estimate deadline planning',
      isFailure: true,
    });
    const [top] = selectStories(
      'Tell me about a time you made a mistake',
      [...bank, secondFailure],
      {
        usedIds: ['outage'],
        limit: 1,
      },
    );
    expect(top.story.id).toBe('estimate');
  });

  it('still reuses the only fitting story rather than substituting a wrong one', () => {
    // With one failure story, telling it again beats answering a failure question
    // with a story that is not about a failure.
    const [top] = selectStories('Tell me about a time you made a mistake', bank, {
      usedIds: ['outage'],
      limit: 1,
    });
    expect(top.story.id).toBe('outage');
    expect(top.reasons.join(' ')).toMatch(/already used/i);
  });

  it('honours the limit so an answer is not diluted', () => {
    expect(
      selectStories('Tell me about a time you took ownership', bank, { limit: 1 }),
    ).toHaveLength(1);
  });

  it('an empty bank returns nothing rather than throwing', () => {
    expect(selectStories('Tell me about a time you failed', [])).toEqual([]);
  });
});

describe('scoring', () => {
  it('weights a tagged principle above an incidental body word', () => {
    const tagged = scoreStory('Tell me about ownership of a system', migration);
    const incidental = scoreStory('Tell me about a checkout page', migration);
    expect(tagged.score).toBeGreaterThan(incidental.score);
  });
});

describe('rendering for the prompt', () => {
  it('omits parts the user left blank', () => {
    const text = renderStory(disagreement);
    expect(text).toContain('Disagreed on the caching strategy');
    expect(text).toContain('Have Backbone');
    expect(text).toContain('Action:');
    expect(text).not.toContain('Situation:');
    expect(text).not.toContain('Result:');
  });
});

describe('stored data that predates the story bank', () => {
  it('returns nothing instead of throwing when the field is absent', () => {
    // Settings saved by an older build have no `stories` key at all.
    expect(selectStories('Tell me about a failure', undefined)).toEqual([]);
    expect(selectStories('Tell me about a failure', [])).toEqual([]);
  });
});

describe('technical questions that contain behavioural vocabulary', () => {
  // A coding question is full of words like "fail", "handle" and "convince". Treating
  // any of them as a story request put unrelated experience into a DSA answer.
  const technical = [
    'Solve two sum and explain the trade-offs',
    'Implement an LRU cache',
    'What is the time complexity of your approach?',
    'What happens if the lookup fails?',
    'Convince me this is O(n)',
    'How would you handle a failure in the middle of the loop?',
    'Describe a binary search tree',
    'Tell me about a hash map',
    'Walk me through your approach',
  ];

  it('are not classified as behavioural', () => {
    for (const q of technical) expect([q, isBehaviouralQuestion(q)]).toEqual([q, false]);
  });

  it('receive no stories at all', () => {
    for (const q of technical) expect([q, selectStories(q, bank).length]).toEqual([q, 0]);
  });
});

describe('behavioural phrasings that do not use the canonical opener', () => {
  const behavioural = [
    'Tell me about a time you disagreed with someone',
    'Tell me about a disagreement you had',
    'Give me an example of when you took ownership',
    'Describe a situation where you missed a deadline',
    'Walk me through a project you owned',
    'Have you ever shipped something that broke?',
    'How did you handle a difficult stakeholder?',
  ];

  it('are recognised', () => {
    for (const q of behavioural) expect([q, isBehaviouralQuestion(q)]).toEqual([q, true]);
  });

  it('always receive something to work from', () => {
    for (const q of behavioural) expect(selectStories(q, bank).length).toBeGreaterThan(0);
  });
});
it('recognizes personal failure and challenge questions without a story opener', () => {
  expect(selectStories('What was your biggest failure?', bank)[0].story.id).toBe('outage');
  expect(selectStories('Describe your most challenging project', bank).length).toBeGreaterThan(0);
});
