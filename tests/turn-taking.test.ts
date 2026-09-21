import { describe, expect, it } from 'vitest';
import {
  END_OF_TURN_MS,
  UtteranceAssembler,
  buildResumePrompt,
  classifyInterruption,
  isAcknowledgement,
  looksComplete,
} from '../src/shared/turn-taking';

describe('assembling one utterance from fragmented speech', () => {
  it('joins segments split by a natural pause instead of answering each one', () => {
    const buffer = new UtteranceAssembler();
    // A single spoken sentence, delivered as three VAD segments with thinking pauses.
    buffer.push('So the way I would approach this', 0);
    expect(buffer.closeReason(900)).toBeNull();
    buffer.push('is to keep a running map', 1200);
    expect(buffer.closeReason(2000)).toBeNull();
    buffer.push('of what we have already seen', 2400);
    expect(buffer.closeReason(2400 + END_OF_TURN_MS - 1)).toBeNull();
    expect(buffer.closeReason(2400 + END_OF_TURN_MS)).toBe('silence');
    expect(buffer.take()).toBe(
      'So the way I would approach this is to keep a running map of what we have already seen',
    );
    expect(buffer.isEmpty).toBe(true);
  });

  it('closes immediately on a finished question rather than waiting out the silence', () => {
    const buffer = new UtteranceAssembler();
    buffer.push('How would you handle duplicate entries?', 0);
    expect(buffer.closeReason(1)).toBe('complete');
  });

  it('closes a monologue on length so something can still be answered', () => {
    const buffer = new UtteranceAssembler();
    buffer.push('a '.repeat(1200), 0);
    expect(buffer.closeReason(1)).toBe('length');
  });

  it('a bare question mark fragment is not treated as complete', () => {
    expect(looksComplete('right?')).toBe(false);
    expect(looksComplete('and what about duplicates?')).toBe(true);
  });
});

describe('classifying speech that arrives mid-answer', () => {
  const streaming = {
    streaming: true,
    answeredSoFar: 'We can use a dictionary to store each index.',
  };

  it('ignores listening noises so the answer keeps streaming', () => {
    for (const noise of ['mm hmm', 'okay', 'right', 'go on', 'yeah exactly', 'got it'])
      expect(classifyInterruption(noise, streaming)).toBe('backchannel');
  });

  it('treats a correction as a revision, never as something to resume', () => {
    for (const fix of [
      'actually return all the pairs',
      'wait, assume the array is sorted',
      'what if there are duplicates',
      'sorry I meant without extra space',
    ])
      expect(classifyInterruption(fix, streaming)).toBe('revision');
  });

  it('treats a short question about the answer as a detour worth resuming after', () => {
    expect(classifyInterruption("what's the complexity of that?", streaming)).toBe('side_question');
    expect(classifyInterruption('why did you use a dictionary?', streaming)).toBe('side_question');
  });

  it('treats a change of subject as a new question', () => {
    expect(classifyInterruption('okay now design a rate limiter for me', streaming)).toBe(
      'new_question',
    );
  });

  it('when nothing is streaming a detour is just the next question', () => {
    const idle = { streaming: false, answeredSoFar: '' };
    expect(classifyInterruption("what's the complexity of that?", idle)).toBe('new_question');
  });

  it('a long utterance is never mistaken for a backchannel', () => {
    expect(isAcknowledgement('okay so walk me through your approach to this problem')).toBe(false);
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

describe('the sequence a real interruption produces', () => {
  /** Mirrors the routing in useSession.closeUtterance, without React. */
  function route(
    utterances: string[],
    startStreaming: boolean,
    answeredSoFar: string,
  ): ReturnType<typeof classifyInterruption>[] {
    let streaming = startStreaming;
    return utterances.map((text) => {
      const kind = classifyInterruption(text, { streaming, answeredSoFar });
      // A backchannel leaves the stream alone; everything else takes it over.
      if (kind !== 'backchannel') streaming = true;
      return kind;
    });
  }

  it('handles a full exchange without losing the thread', () => {
    expect(
      route(
        [
          'mm hmm',
          "what's the complexity of that?",
          'actually make it return all pairs',
          'okay now tell me about a time you disagreed with someone',
        ],
        true,
        'We can walk the array once and store each index in a dictionary.',
      ),
    ).toEqual(['backchannel', 'side_question', 'revision', 'new_question']);
  });

  it('a pause mid-sentence never reaches the router at all', () => {
    const buffer = new UtteranceAssembler();
    buffer.push('Can you', 0);
    buffer.push('walk me through', 700);
    buffer.push('your approach?', 1500);
    // Only one utterance is ever produced, so only one question is ever asked.
    expect(buffer.closeReason(1600)).toBe('complete');
    expect(buffer.take()).toBe('Can you walk me through your approach?');
  });
});
