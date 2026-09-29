import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import interviewMaster from '../src/shared/interview-master.json';
import { buildInstructions } from '../src/shared/prompts';
import { settingsSchema } from '../src/shared/contracts';

// Fingerprint of the complete uploaded Pasted markdown(7).md, including whitespace.
it('preserves the uploaded master verbatim and sends it exactly once', () => {
  expect(createHash('sha256').update(interviewMaster.prompt, 'utf8').digest('hex')).toBe(
    'e19942f01776d7b6dd09461d0036508d7fc61cf4785e425d02c72917c114228a',
  );
  const instructions = buildInstructions(settingsSchema.parse({}));
  expect(instructions.split(interviewMaster.prompt)).toHaveLength(2);
  expect(instructions).toContain('Ramesh Reddy Changal');
});

it('keeps a configured candidate name while retaining the complete master', () => {
  const instructions = buildInstructions(settingsSchema.parse({ candidateName: 'Test Candidate' }));
  expect(instructions).toContain('Candidate name: "Test Candidate"');
  expect(instructions).toContain(interviewMaster.prompt);
});
