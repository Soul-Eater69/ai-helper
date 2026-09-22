import { expect, it } from 'vitest';
import {
  currentRequirements,
  requirementsFromAnswer,
  requirementsAsNotes,
} from '../src/shared/requirements';
import { extractProposal } from '../src/shared/revision';
import { answerAsNotes } from '../src/shared/visual-trace';
const snapshot = (points: string[], topic = 'Locker') =>
  '```requirements\n' +
  JSON.stringify({ version: 1, topic, requirements: points, outOfScope: [] }) +
  '\n```';
const turn = (answer: string, status = 'done', question = 'exact match') => ({
  answer,
  status,
  question,
});

it('adds agreed notes and replaces corrected snapshots without duplicate bullets', () => {
  const turns = [turn(snapshot(['One location'])), turn(snapshot(['One location', 'Exact match']))];
  expect(currentRequirements(turns)?.requirements).toEqual(['One location', 'Exact match']);
  turns.push(turn(snapshot(['One location', 'Smallest size that fits'])));
  expect(currentRequirements(turns)?.requirements).toEqual([
    'One location',
    'Smallest size that fits',
  ]);
});
it('does not accept streaming, cancelled, malformed or oversized snapshots', () => {
  const original = turn(snapshot(['Exact match']));
  for (const bad of [
    turn(snapshot(['Changed']), 'streaming'),
    turn(snapshot(['Changed']), 'cancelled'),
    turn('```requirements\n{bad}\n```'),
    turn(snapshot(['x'.repeat(301)])),
  ]) {
    expect(currentRequirements([original, bad])?.requirements).toEqual(['Exact match']);
  }
});
it('clears notes on explicit new questions and empty sessions and switches topic', () => {
  expect(currentRequirements([])).toBeNull();
  expect(
    currentRequirements([
      turn(snapshot(['Exact match'])),
      turn('', 'streaming', 'Next question: design parking lot'),
    ]),
  ).toBeNull();
  expect(
    currentRequirements([
      turn(snapshot(['Exact match'])),
      turn(snapshot(['One floor'], 'Parking lot')),
    ])?.topic,
  ).toBe('Parking lot');
});
it('keeps notes display-only, ignores nested examples, and copies readable text', () => {
  const text = snapshot(['One location']);
  expect(extractProposal(text, 1)).toBeNull();
  expect(requirementsFromAnswer('````text\n' + text + '\n````')).toBeNull();
  expect(answerAsNotes(text)).toBe(requirementsAsNotes(requirementsFromAnswer(text)!));
  expect(answerAsNotes(text)).not.toContain('"version"');
});
