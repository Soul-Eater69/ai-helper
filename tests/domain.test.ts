import { describe, it, expect } from 'vitest';
import {
  acceptRevision,
  undoRevision,
  editDocument,
  createDocument,
  extractProposal,
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
  it('never proposes a partial or ambiguous code fence', () => {
    expect(extractProposal('```python\nprint(1)', 0)).toBeNull();
    expect(extractProposal('```python\na\n```\n```python\nb\n```', 0)).toBeNull();
    expect(extractProposal('Explanation\n```python\nprint(1)\n```', 4)).toEqual({
      baseVersion: 4,
      code: 'print(1)',
      language: 'python',
    });
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
