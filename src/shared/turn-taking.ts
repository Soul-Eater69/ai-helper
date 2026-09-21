/**
 * What an interruption means for the answer currently streaming.
 *
 * The speech router in the main process already decides *whether* transcribed speech
 * deserves a response (answer / wait / ignore), so nothing here re-detects turns or
 * filters backchannel -- an utterance only reaches this module once the router has
 * approved it. The remaining question is narrower and the router does not address it:
 * when an approved utterance lands mid-answer, does it replace that answer, interrupt
 * it briefly, or start a new one?
 */

const REVISION_MARKERS = [
  'actually',
  'wait',
  'sorry',
  'instead',
  'rather than',
  'no no',
  'not quite',
  'let me correct',
  'i meant',
  'change that',
  'change it',
  'what if',
  "let's say",
  'lets say',
  'assume',
  'suppose',
  'but now',
  'except',
];

const SIDE_QUESTION_MARKERS = [
  'complexity',
  'big o',
  'why did you',
  'why do you',
  'why that',
  'what does that',
  'what is that',
  'can you explain',
  'sorry what',
  'say that again',
  'repeat that',
  'which one',
];

const strip = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const words = (text: string): number => strip(text).split(' ').filter(Boolean).length;

const hasAny = (text: string, needles: readonly string[]): boolean =>
  needles.some((needle) => text.includes(needle));

export type Interruption =
  /** The premise changed. Rewrite this answer; resuming it would be wrong. */
  | 'revision'
  /** A brief detour. Answer it, then resume the interrupted answer from its prefix. */
  | 'side_question'
  /** A different subject. Close the interrupted answer and open a new one. */
  | 'new_question';

export interface InterruptionContext {
  /** How much of the answer has streamed, used to tell a detour from a new topic. */
  answeredSoFar: string;
}

/**
 * Classifies an already-approved utterance that arrived while an answer was streaming.
 *
 * Resuming is deliberately reserved for a detour: continuing an answer whose premise the
 * interviewer just withdrew would keep writing something they have already rejected.
 */
export function classifyInterruption(raw: string, context: InterruptionContext): Interruption {
  const text = strip(raw);
  if (!text) return 'new_question';

  // A correction wins over everything: it invalidates the answer being written.
  if (hasAny(text, REVISION_MARKERS)) return 'revision';

  const short = words(text) <= 12;
  if (short && (hasAny(text, SIDE_QUESTION_MARKERS) || referencesAnswer(raw, context)))
    return 'side_question';

  return 'new_question';
}

/** A short question reusing words the answer just used is almost always about it. */
function referencesAnswer(raw: string, context: InterruptionContext): boolean {
  const text = strip(raw);
  if (!raw.trim().endsWith('?') && !/^(why|what|how|which|does|is|are|can)\b/.test(text))
    return false;
  const recent = new Set(strip(context.answeredSoFar).split(' ').slice(-120));
  const content = text.split(' ').filter((word) => word.length > 4);
  return content.length > 0 && content.some((word) => recent.has(word));
}

/**
 * Builds the continuation request for a detour: the model is handed what it already said
 * and asked to pick the thread back up rather than restart.
 */
export function buildResumePrompt(question: string, answeredSoFar: string): string {
  return [
    `Resume your interrupted answer to: ${question}`,
    '',
    'You had already said the following out loud, and the candidate has read it:',
    answeredSoFar.trim(),
    '',
    'Continue from exactly where that stops. Do not greet, do not restate the question,',
    'and do not repeat anything above. If the interruption changed nothing, simply carry on.',
  ].join('\n');
}
