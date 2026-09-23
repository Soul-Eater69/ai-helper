import type { SpeechRequest, SpeechDecision } from './contracts';
/** Only standalone social turns. Mixed requests and technical replies use the router. */
export function fastSpeechDecision(request: SpeechRequest): SpeechDecision | undefined {
  const text = request.text
    .trim()
    .toLowerCase()
    .replace(/[?!.,—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (request.currentResponse.toLowerCase().includes(request.text.trim().toLowerCase())) return;
  if (/^(?:(?:hey|hi|hello)(?: [a-z]+)? )?how are you(?: doing| today)?$/.test(text))
    return { action: 'answer' };
  return undefined;
}
