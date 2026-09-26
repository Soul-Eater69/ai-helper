import { expect, it } from 'vitest';
import { transcriptionVocabulary } from '../src/main/transcription';

it('builds a bounded vocabulary hint including the candidate name', () => {
  const hint = transcriptionVocabulary('Mahesh');
  expect(hint).toContain('Candidate: Mahesh.');
  expect(hint).toContain('indegree');
  expect(hint.length).toBeLessThan(1000);
  expect(transcriptionVocabulary('')).not.toContain('Candidate:');
});
