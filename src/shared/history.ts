import type { SpeechRequest } from './contracts';
/** Keep the opening question and newest complete turns inside a bounded provider payload. */
export function buildHistory(
  turns: readonly { question: string; answer: string; status: string }[],
) {
  type Message = { role: 'user' | 'assistant'; content: string };
  if (!turns.length) return [] as Message[];
  const opening: Message = { role: 'user', content: turns[0].question.slice(0, 20000) };
  const recent: Message[] = [];
  let remaining = 80000 - opening.content.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const group: Message[] = i ? [{ role: 'user', content: turn.question.slice(0, 20000) }] : [];
    if (turn.status === 'done')
      group.push({ role: 'assistant', content: turn.answer.slice(0, 20000) });
    const size = group.reduce((n, m) => n + m.content.length, 0);
    if (size > remaining || recent.length + group.length > 59) break;
    recent.unshift(...group);
    remaining -= size;
  }
  return [opening, ...recent];
}

/** Bound old routing context, preserving the current utterance and the last clarification. */
export function compactSpeechRequest(request: SpeechRequest): SpeechRequest {
  return {
    ...request,
    recentSpeech: request.recentSpeech.slice(-6).map((text) => text.slice(-600)),
    history: request.history.slice(-2).map((message) => ({
      ...message,
      content:
        message.role === 'assistant'
          ? message.content.slice(-1200)
          : message.content.slice(0, 1200),
    })),
    currentResponse: request.currentResponse.slice(-1200),
  };
}
