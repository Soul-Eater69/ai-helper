import { expect, it } from 'vitest';
import { SpeechService } from '../src/main/speech';
import { settingsSchema } from '../src/shared/contracts';
const request = (text: string, currentResponse = '') => ({
  text,
  currentResponse,
  context: '',
  history: [],
  recentSpeech: [],
});
it('uses contextual routing for greetings too, with no query-specific bypass', async () => {
  const seen: string[] = [];
  const service = new SpeechService(async (r) => {
    seen.push(r.text);
    return { action: 'ignore' };
  });
  expect(
    await service.route(request('Hey Ramesh, how are you?'), settingsSchema.parse({}), 'test'),
  ).toEqual({ action: 'ignore' });
  expect(seen).toEqual(['Hey Ramesh, how are you?']);
});
