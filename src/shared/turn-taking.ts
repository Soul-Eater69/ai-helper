/**
 * Turn taking for a continuously listening session.
 *
 * Two problems live here. First, one spoken sentence arrives as several final
 * transcript segments, because server VAD closes a segment on every short pause --
 * answering each segment separately is what produced a new chat entry per pause.
 * Second, speech that arrives while an answer is streaming is not all the same
 * thing: "mm-hmm" must not interrupt, "what's the complexity?" deserves a detour,
 * and "actually, return all pairs" invalidates the answer being written.
 *
 * Everything here is pure and clock-injected so the behaviour is identical in
 * tests and in an interview.
 */

/** A silence long enough to mean the speaker finished, not just drew breath. */
export const END_OF_TURN_MS = 1800;

/** Beyond this a monologue is closed anyway so something can be answered. */
export const MAX_UTTERANCE_CHARS = 2000;

const ACKNOWLEDGEMENTS = [
  'yes',
  'yeah',
  'yep',
  'no',
  'okay',
  'ok',
  'right',
  'sure',
  'cool',
  'nice',
  'good',
  'great',
  'perfect',
  'exactly',
  'correct',
  'got it',
  'i see',
  'makes sense',
  'sounds good',
  'go on',
  'go ahead',
  'carry on',
  'keep going',
  'mm hmm',
  'mhm',
  'uh huh',
  'thanks',
  'thank you',
];

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
  'hold on what',
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

/**
 * True when the text already reads as a finished question, so the answer can start
 * without waiting out the full silence window.
 */
export function looksComplete(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith('?') && words(trimmed) >= 4;
}

/** True for a listening noise that should never interrupt a streaming answer. */
export function isAcknowledgement(text: string): boolean {
  const clean = strip(text);
  if (!clean) return true;
  if (words(clean) > 4) return false;
  return ACKNOWLEDGEMENTS.some(
    (token) => clean === token || clean.startsWith(`${token} `) || clean.endsWith(` ${token}`),
  );
}

export type Interruption =
  /** A listening noise. Ignore it; the answer keeps streaming. */
  | 'backchannel'
  /** A detour. Answer it, then resume the interrupted answer from its prefix. */
  | 'side_question'
  /** The premise changed. Do not resume; redo this entry with the new constraint. */
  | 'revision'
  /** A different subject. Close the interrupted entry and open a new one. */
  | 'new_question';

export interface InterruptionContext {
  /** Whether an answer is mid-stream. When false the only outcomes are revision or new. */
  streaming: boolean;
  /** How much of the answer has streamed, used to tell a detour from a fresh topic. */
  answeredSoFar: string;
}

/**
 * Decides what a newly closed utterance means for the answer in flight.
 *
 * Resuming is only ever safe for a detour. Resuming after a revision would continue
 * writing an answer whose premise the interviewer just withdrew, so the two are
 * deliberately separated rather than folded into one "interrupted" state.
 */
export function classifyInterruption(raw: string, context: InterruptionContext): Interruption {
  const text = strip(raw);
  if (!text) return 'backchannel';
  if (context.streaming && isAcknowledgement(text)) return 'backchannel';

  // A correction wins over everything: it invalidates the answer being written.
  if (hasAny(text, REVISION_MARKERS)) return 'revision';

  if (context.streaming) {
    const short = words(text) <= 12;
    if (short && (hasAny(text, SIDE_QUESTION_MARKERS) || referencesAnswer(text, context)))
      return 'side_question';
  }
  return 'new_question';
}

/** A short question using words the answer just used is almost always about that answer. */
function referencesAnswer(text: string, context: InterruptionContext): boolean {
  if (!text.endsWith('?') && !/^(why|what|how|which|does|is|are|can)\b/.test(text)) return false;
  const recent = new Set(strip(context.answeredSoFar).split(' ').slice(-120));
  const content = strip(text)
    .split(' ')
    .filter((word) => word.length > 4);
  if (!content.length) return false;
  return content.some((word) => recent.has(word));
}

/**
 * Joins final transcript segments into one utterance. The caller drives the clock, so
 * no timer is hidden in here and the whole thing is deterministic under test.
 */
export class UtteranceAssembler {
  private parts: string[] = [];

  private lastAt = 0;

  push(text: string, at: number): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.parts.push(trimmed);
    this.lastAt = at;
  }

  get pending(): string {
    return this.parts.join(' ');
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  get idleSince(): number {
    return this.lastAt;
  }

  /** Whether the buffer should be closed now, and why. */
  closeReason(now: number, silenceMs = END_OF_TURN_MS): 'complete' | 'length' | 'silence' | null {
    if (this.isEmpty) return null;
    const text = this.pending;
    if (looksComplete(text)) return 'complete';
    if (text.length >= MAX_UTTERANCE_CHARS) return 'length';
    if (now - this.lastAt >= silenceMs) return 'silence';
    return null;
  }

  /** Drains the buffer and returns the assembled utterance. */
  take(): string {
    const text = this.pending;
    this.reset();
    return text;
  }

  reset(): void {
    this.parts = [];
    this.lastAt = 0;
  }
}

/**
 * Builds the continuation request for a detour: the model is handed what it already
 * said and asked to pick the thread back up rather than restart.
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
