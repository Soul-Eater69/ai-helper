import { expect, it } from 'vitest';
import { fastSpeechDecision } from '../src/shared/speech-fast-path';
const request = (text: string, currentResponse = '') => ({
  text,
  currentResponse,
  context: '',
  history: [],
  recentSpeech: [],
});
it('avoids a routing call only for clear standalone greetings', () => {
  expect(fastSpeechDecision(request('Hey Ramesh, how are you?'))).toEqual({ action: 'answer' });
  for (const text of [
    'How are you handling errors?',
    'Hi, design a parking lot',
    'yes',
    'um',
    'How are you? Design a locker.',
  ])
    expect(fastSpeechDecision(request(text))).toBeUndefined();
  expect(fastSpeechDecision(request('How are you?', 'I am well. How are you?'))).toBeUndefined();
});
