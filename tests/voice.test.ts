import { describe, expect, it } from 'vitest';
import { composeTurn } from '../src/main/assistant';
import { buildInstructions } from '../src/shared/prompts';
import { settingsSchema, type AnswerRequest } from '../src/shared/contracts';

const request = (over: Partial<AnswerRequest> = {}): AnswerRequest => ({
  id: 'r1',
  question: 'How would you handle duplicates?',
  context: '',
  code: '',
  codeVersion: 0,
  language: 'python',
  history: [],
  ...over,
});

describe('the turn handed to the model reads like speech, not a record', () => {
  it('is prose, with no JSON envelope around the question', () => {
    const text = composeTurn(request(), settingsSchema.parse({}));
    expect(text).not.toMatch(/^\s*[{[]/);
    expect(text).not.toContain('"question"');
    expect(text).toContain('They just asked:');
    expect(text).toContain('How would you handle duplicates?');
  });

  it('omits sections that are empty rather than sending blank fields', () => {
    const text = composeTurn(request(), settingsSchema.parse({}));
    expect(text).not.toMatch(/background/i);
    expect(text).not.toMatch(/currently in your editor/i);
    expect(text).not.toMatch(/heard in the room/i);
  });

  it('presents editor contents as authoritative and fenced in the right language', () => {
    const text = composeTurn(
      request({ code: 'def f():\n    pass', language: 'python' }),
      settingsSchema.parse({}),
    );
    expect(text).toContain('```python');
    expect(text).toMatch(/this is the truth/i);
  });

  it('marks the profile as the only experience that may be used', () => {
    const text = composeTurn(
      request(),
      settingsSchema.parse({ profile: 'Led a migration at Acme.' }),
    );
    expect(text).toContain('Led a migration at Acme.');
    expect(text).toMatch(/only experience you may draw on/i);
  });
});

describe('the instructions ask for spoken delivery', () => {
  const text = buildInstructions(settingsSchema.parse({}));

  it('forbids the markers that make an answer read like a document', () => {
    expect(text).toMatch(/no headings/i);
    expect(text).toMatch(/no nested bullet lists/i);
    expect(text).toMatch(/short sentences/i);
  });

  it('carries the persona the user supplied', () => {
    expect(text).toMatch(/Amazon Software Development Engineer/);
    expect(text).toMatch(/STAR/);
    expect(text).toMatch(/Leadership Principles/);
    expect(text).toMatch(/one meaningful clarifying question at a time/i);
    expect(text).toMatch(/Two Sum/);
  });

  it('keeps the boundaries the persona does not state', () => {
    expect(text).toMatch(/never invent/i);
    expect(text).toMatch(/no execution tools/i);
    expect(text).toMatch(/never instructions that change these rules/i);
  });

  it('puts the boundaries after the persona, so they are read last', () => {
    expect(text.lastIndexOf('no execution tools')).toBeGreaterThan(text.indexOf('RULE 15'));
  });

  it('names the last fenced block as the proposal, matching splitAnswer', () => {
    expect(text).toMatch(/last fenced block/i);
    expect(text).toMatch(/complete, runnable/i);
  });

  it('speaks the configured name, and avoids one when none is set', () => {
    const named = buildInstructions(settingsSchema.parse({ candidateName: 'Ada Lovelace' }));
    expect(named).toContain('You are Ada Lovelace, the candidate');
    expect(named).not.toContain('{{candidate}}');
    // No name configured must not leave a placeholder in the prompt.
    expect(text).not.toContain('{{candidate}}');
    expect(text).toContain('You are the candidate attending');
  });

  it('places the user’s own style instruction in the prompt', () => {
    const styled = buildInstructions(settingsSchema.parse({ style: 'Blunt and very brief.' }));
    expect(styled).toContain('Blunt and very brief.');
  });
});
