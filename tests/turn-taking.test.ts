import { describe, expect, it } from 'vitest';
import {
  buildResumePrompt,
  classifyInterruption,
  type Interruption,
} from '../src/shared/turn-taking';

// The speech router upstream has already decided this utterance deserves a response,
// so these cases never include filler or backchannel -- that never reaches this module.
const mid = { answeredSoFar: 'We can walk the array once and store each index in a dictionary.' };

describe('what an approved utterance means for the answer in flight', () => {
  it('treats a correction as a revision, never as something to resume', () => {
    for (const fix of [
      'actually return all the pairs',
      'wait, assume the array is sorted',
      'what if there are duplicates',
      'sorry I meant without extra space',
    ])
      expect(classifyInterruption(fix, mid)).toBe<Interruption>('revision');
  });

  it('treats a short question about the answer as a detour worth resuming after', () => {
    expect(classifyInterruption("what's the complexity of that?", mid)).toBe('side_question');
    expect(classifyInterruption('why did you use a dictionary?', mid)).toBe('side_question');
  });

  it('treats a change of subject as a new question', () => {
    expect(classifyInterruption('okay now design a rate limiter for me', mid)).toBe('new_question');
    expect(classifyInterruption('tell me about a time you disagreed with someone', mid)).toBe(
      'new_question',
    );
  });

  it('does not mistake a long question for a detour just because it echoes a word', () => {
    expect(
      classifyInterruption(
        'can you walk me through how you would shard that dictionary across machines',
        mid,
      ),
    ).toBe('new_question');
  });

  it('a question sharing no vocabulary with the answer is a new question', () => {
    expect(classifyInterruption('how do you test this?', mid)).toBe('new_question');
  });
});

describe('resuming an interrupted answer', () => {
  it('hands back the prefix and forbids repeating it', () => {
    const prompt = buildResumePrompt('Solve two sum', 'We can use a dictionary.');
    expect(prompt).toContain('Solve two sum');
    expect(prompt).toContain('We can use a dictionary.');
    expect(prompt).toMatch(/do not repeat/i);
    expect(prompt).toMatch(/continue from exactly where/i);
  });
});
