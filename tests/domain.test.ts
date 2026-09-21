import { describe, it, expect } from 'vitest';
import {
  acceptRevision,
  undoRevision,
  editDocument,
  createDocument,
  splitAnswer,
} from '../src/shared/revision';
import { TranscriptBuffer } from '../src/shared/transcript';
import { buildInstructions } from '../src/shared/prompts';
import { settingsSchema, answerRequestSchema } from '../src/shared/contracts';

describe('code review safety', () => {
  it('refuses a replacement if the user typed while it was generated', () => {
    const original = createDocument('print(1)');
    const edited = editDocument(original, 'print(2)');
    expect(() =>
      acceptRevision(edited, { baseVersion: 0, code: 'print(3)', language: 'python' }),
    ).toThrow(/changed/i);
    expect(edited.code).toBe('print(2)');
  });
  it('undo restores exact text and invalidates older proposals', () => {
    const initial = createDocument('a\n\n');
    const applied = acceptRevision(initial, { baseVersion: 0, code: 'b\n', language: 'python' });
    const undone = undoRevision(applied);
    expect(undone.code).toBe('a\n\n');
    expect(undone.version).toBe(2);
  });
  it('never proposes an unterminated code fence', () => {
    expect(splitAnswer('```python\nprint(1)', 0).proposal).toBeNull();
    expect(splitAnswer('No code here at all.', 0).proposal).toBeNull();
    expect(splitAnswer('Explanation\n```python\nprint(1)\n```', 4).proposal).toEqual({
      baseVersion: 4,
      code: 'print(1)',
      language: 'python',
    });
  });
  it('proposes the final block when the answer walks through an earlier one', () => {
    // The guidance asks for a brute force before the real solution, so a two-block
    // answer is expected. Previously this proposed nothing AND stripped both blocks
    // from the transcript, losing the code entirely.
    const answer = 'Brute force first:\n```python\nbrute()\n```\nBetter:\n```python\nfast()\n```';
    const { spoken, proposal } = splitAnswer(answer, 2);
    expect(proposal).toEqual({ baseVersion: 2, code: 'fast()', language: 'python' });
    // The illustrative block stays where it was said; only the proposal leaves.
    expect(spoken).toContain('brute()');
    expect(spoken).not.toContain('fast()');
    expect(spoken).toMatch(/code workspace/i);
  });
  it('never claims code is in the workspace when none was proposed', () => {
    const answer = 'Just talking this through, no code yet.';
    const { spoken, proposal } = splitAnswer(answer, 0);
    expect(proposal).toBeNull();
    expect(spoken).toBe(answer);
    expect(spoken).not.toMatch(/workspace/i);
  });
});

describe('transcript assembly', () => {
  it('keeps committed order even when final transcripts arrive backwards', () => {
    const buffer = new TranscriptBuffer();
    buffer.commit('a', null);
    buffer.commit('b', 'a');
    expect(buffer.finish('b', 'second')).toEqual([]);
    expect(buffer.finish('a', 'first')).toEqual([
      { id: 'a', text: 'first' },
      { id: 'b', text: 'second' },
    ]);
    expect(buffer.finish('a', 'first')).toEqual([]);
  });
  it('allows a failed transcription to release later turns', () => {
    const buffer = new TranscriptBuffer();
    buffer.commit('a', null);
    buffer.commit('b', 'a');
    buffer.finish('b', 'next');
    expect(buffer.finish('a', '')).toEqual([{ id: 'b', text: 'next' }]);
  });
});

describe('input and prompt boundaries', () => {
  it('rejects oversized and invalid settings and requests', () => {
    expect(settingsSchema.safeParse({ mode: 'invalid' }).success).toBe(false);
    expect(answerRequestSchema.safeParse({ question: 'x'.repeat(20001) }).success).toBe(false);
  });
  it('grounds behavioral answers and separates supplied facts from instructions', () => {
    const settings = settingsSchema.parse({});
    const text = buildInstructions(settings);
    expect(text).toMatch(/never invent/i);
    expect(text).toMatch(/STAR/);
    expect(text).toMatch(/simple.*English/i);
  });
  it('preserves one-at-a-time clarification and reviewable complete code in LLD', () => {
    const text = buildInstructions(settingsSchema.parse({}));
    expect(text).toMatch(/one clarifying question/i);
    expect(text).toMatch(/complete.*code/i);
  });
});

describe('choosing which fence is the proposal', () => {
  it('ignores an untagged output block in favour of the tagged code', () => {
    const answer = 'Here it is:\n```python\nsolve()\n```\nWhich prints:\n```\n[1, 2]\n```';
    const { proposal, spoken } = splitAnswer(answer, 0);
    expect(proposal?.code).toBe('solve()');
    // The sample output is part of the explanation and stays where it was said.
    expect(spoken).toContain('[1, 2]');
  });
  it('falls back to an untagged block when the model omitted the language', () => {
    const { proposal } = splitAnswer('```\ndef f():\n    pass\n```', 0);
    expect(proposal?.code).toBe('def f():\n    pass');
  });
  it('skips an empty fence', () => {
    expect(splitAnswer('```python\n\n```', 0).proposal).toBeNull();
  });
});
