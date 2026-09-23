import type { ImageAttachment } from './images';
import type { SpeechRequest } from './contracts';
import { answerAsNotes } from './visual-trace';
import type { AnswerRequest } from './contracts';

/** Only exact artifact duplicates are replaced; user facts and prose remain verbatim. */
export function deduplicateCodeHistory(
  history: AnswerRequest['history'],
  currentCode: string,
): AnswerRequest['history'] {
  const normalize = (text: string) => text.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  const seen = new Map<string, string>();
  if (currentCode) seen.set(normalize(currentCode), 'the currentCode field');
  return history
    .map((message) => ({ ...message }))
    .reverse()
    .map((message) => {
      if (message.role !== 'assistant') return message;
      return {
        ...message,
        content: message.content.replace(
          /^```(?:python|py|java|javascript|js|typescript|ts|cpp|c\+\+)\s*\n([\s\S]*?)^```[ \t]*$/gm,
          (block, body: string) => {
            const code = normalize(body);
            const reference = seen.get(code);
            if (reference) return `[Identical implementation retained in ${reference}.]`;
            seen.set(code, 'a later assistant message');
            return block;
          },
        ),
      };
    })
    .reverse();
}
/** Keep the opening question and newest complete turns inside a bounded provider payload. */
export function buildHistory(
  turns: readonly {
    question: string;
    answer: string;
    status: string;
    images?: ImageAttachment[];
  }[],
) {
  type Message = { role: 'user' | 'assistant'; content: string; images?: ImageAttachment[] };
  if (!turns.length) return [] as Message[];
  let latestImageIndex = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].images?.length) {
      latestImageIndex = i;
      break;
    }
  }
  const opening: Message = {
    role: 'user',
    content: turns[0].question.slice(0, 20000),
    ...(latestImageIndex === 0 ? { images: turns[0].images } : {}),
  };
  const recent: Message[] = [];
  let remaining = 80000 - opening.content.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const group: Message[] = i
      ? [
          {
            role: 'user',
            content: turn.question.slice(0, 20000),
            ...(i === latestImageIndex ? { images: turn.images } : {}),
          },
        ]
      : [];
    if (turn.status === 'done')
      group.push({ role: 'assistant', content: answerAsNotes(turn.answer).slice(0, 20000) });
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
      role: message.role,
      content:
        message.role === 'assistant'
          ? answerAsNotes(message.content).slice(-1200)
          : message.content.slice(0, 1200),
    })),
    currentResponse: answerAsNotes(request.currentResponse).slice(-1200),
  };
}
