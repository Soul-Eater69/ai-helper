import { isBehaviouralQuestion, selectStories, renderStory } from '../shared/story-bank';
import OpenAI from 'openai';
import { buildInstructions } from '../shared/prompts';
import { deduplicateCodeHistory } from '../shared/history';
import { detectTopics, needsReasoning, topicsIn } from '../shared/topics';
import type { AppEvent, AnswerRequest, Mode, Settings } from '../shared/contracts';
export type ProviderEvent = { type: 'delta'; text: string } | { type: 'complete' };
export type StreamProvider = (
  request: AnswerRequest,
  settings: Settings,
  key: string,
  signal: AbortSignal,
) => AsyncIterable<ProviderEvent>;
export function friendlyError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 401) return 'The API key was rejected. Update it in Settings.';
  if (status === 429)
    return 'OpenAI rate limit or API quota reached. Check API billing, then retry.';
  if (status === 404)
    return 'This model is unavailable for your account. Change the model in Settings.';
  if (status === 400)
    return 'OpenAI rejected the request. Check your model settings and try a shorter question.';
  return 'The request could not finish. Check your connection and model access, then retry. Your code is unchanged.';
}
const FOLLOW_UP =
  /^(?:and |okay[, ]+|ok[, ]+|so |right[, ]+|got it[, ]+|interesting[, ]+|thanks[, ]+)*(?:how did|how do you know|how would|how long|how many|how much|how big|why did|why |what did|what would you|what happened|what was|what were|what data|what metrics?|what if|what else|what about|who |which |when did|did you|were you|was it|was there|looking back|in hindsight|if you|tell me more|go deeper|dig into|explain that|can you elaborate|elaborate|walk me through (?:that|how|what))/i;
/**
 * A deep-dive probe on the previous story ("what would you do differently?", "what data
 * did you use?", "who else was involved?"). Short non-technical turns also count, so the
 * story's facts stay attached; the prompt already says not to force a story that does
 * not fit.
 */
export function isStoryFollowUp(text: string): boolean {
  const trimmed = text.trim();
  if (FOLLOW_UP.test(trimmed)) return true;
  const technical = topicsIn(trimmed).some((topic) => topic === 'dsa' || topic === 'lld');
  return trimmed.length <= 160 && !technical;
}
/**
 * Resolve stored facts in main. Stories are replayed over the session's behavioral
 * questions so one already told is outranked by a fresh fit (each interviewer in a loop
 * probes different principles, and repeating a story is a red flag), while a follow-up
 * gets exactly the stories its original question was answered with.
 */
export function composeAnswerContext(request: AnswerRequest, settings: Settings) {
  const history = request.history;
  let followUpOf = -1;
  if (!isBehaviouralQuestion(request.question) && isStoryFollowUp(request.question)) {
    for (let i = history.length - 1; i >= 0; i--) {
      const turn = history[i];
      if (turn.role !== 'user') continue;
      if (isBehaviouralQuestion(turn.content)) {
        followUpOf = i;
        break;
      }
      if (!isStoryFollowUp(turn.content)) break;
    }
  }
  const used: string[] = [];
  let followUpStories: ReturnType<typeof selectStories> = [];
  history.forEach((turn, index) => {
    if (turn.role !== 'user' || !isBehaviouralQuestion(turn.content)) return;
    const picked = selectStories(turn.content, settings.stories, { usedIds: used });
    if (index === followUpOf) followUpStories = picked;
    if (picked[0] && !used.includes(picked[0].story.id)) used.push(picked[0].story.id);
  });
  const stories =
    followUpOf >= 0
      ? followUpStories
      : selectStories(request.question, settings.stories, { usedIds: used });
  return {
    question: request.question,
    pinnedContext: request.context,
    recentSpokenContext: request.speechContext ?? [],
    language: request.language,
    currentCode: request.code,
    codeSource: request.codeSource ?? 'working',
    experienceFacts: settings.profile,
    relevantExperiences: stories.map((entry) => renderStory(entry.story)),
    storiesAlreadyTold: settings.stories
      .filter((story) => used.includes(story.id))
      .map((story) => story.title || 'Untitled'),
    isStoryFollowUp: followUpOf >= 0,
  };
}
export type AnswerContext = ReturnType<typeof composeAnswerContext>;
/**
 * Render the turn as plain labelled text with the question first. A JSON blob hides the
 * question among escaped code and profile text; models read and follow this far better.
 * Section names match the identifiers the instructions refer to (currentCode, codeSource,
 * experienceFacts, relevantExperiences). Experience facts are only sent when the turn can
 * use them (behavioral or conversational), not on every coding turn.
 */
export function formatAnswerContext(context: AnswerContext, topics: readonly Mode[]): string {
  const sections = [`Question (latest interviewer turn):\n${context.question}`];
  if (context.recentSpokenContext.length)
    sections.push(
      `Recent spoken context (earlier transcript fragments, oldest first; may contain transcription errors):\n${context.recentSpokenContext.map((line) => `- ${line}`).join('\n')}`,
    );
  if (context.pinnedContext.trim())
    sections.push(`Pinned requirements and context:\n${context.pinnedContext}`);
  sections.push(`Selected language: ${context.language}`);
  if (context.currentCode.trim())
    sections.push(
      `currentCode (codeSource=${context.codeSource}${context.codeSource === 'proposal' ? ', the latest unaccepted draft' : ', the actual editor contents'}):\n\`\`\`${context.language}\n${context.currentCode}\n\`\`\``,
    );
  else sections.push('currentCode: (empty)');
  const personal = topics.includes('behavioral') || topics.length === 0;
  if (personal && context.experienceFacts.trim())
    sections.push(`experienceFacts:\n${context.experienceFacts}`);
  if (context.relevantExperiences.length)
    sections.push(
      `relevantExperiences${context.isStoryFollowUp ? ' (the story being probed; answer only the probe from these facts)' : ''}:\n${context.relevantExperiences.join('\n\n')}`,
    );
  if (
    !context.isStoryFollowUp &&
    context.storiesAlreadyTold.length &&
    topics.includes('behavioral')
  )
    sections.push(
      `Stories already told this session (prefer a different one if it fits): ${context.storiesAlreadyTold.join('; ')}`,
    );
  return sections.join('\n\n');
}
/** Reasoning-capable models that accept an explicit effort, including `none`. */
export function supportsReasoningEffort(model: string): boolean {
  return model === 'gpt-5.6-sol' || (/^gpt-5\.\d+/.test(model) && !/chat/i.test(model));
}
/** Effort to request for this turn, or undefined to use the model default. */
export function chooseReasoning(
  settings: Settings,
  question: string,
  topics: readonly Mode[],
): 'none' | 'low' | 'medium' | undefined {
  if (!supportsReasoningEffort(settings.model)) return undefined;
  switch (settings.answerReasoning) {
    case 'auto':
      return undefined;
    case 'adaptive':
      return needsReasoning(question, topics) ? 'low' : 'none';
    default:
      return settings.answerReasoning;
  }
}
function isReasoningRejected(error: unknown): boolean {
  const value = error as { status?: number; param?: string; message?: string };
  return value?.status === 400 && /reasoning/i.test(`${value.param ?? ''} ${value.message ?? ''}`);
}
export function createOpenAIProvider(
  trace: (event: string, data: Record<string, unknown>) => void = () => {},
): StreamProvider {
  let connection: { key: string; client: OpenAI } | undefined;
  return async function* (request, settings, key, signal) {
    if (connection?.key !== key)
      connection = { key, client: new OpenAI({ apiKey: key, maxRetries: 1, timeout: 60000 }) };
    const client = connection.client;
    const started = performance.now();
    const history = deduplicateCodeHistory(request.history, request.code);
    const topics = detectTopics({
      question: request.question,
      context: request.context,
      speechContext: request.speechContext,
      code: request.code,
      history,
    });
    const instructions = buildInstructions(settings, topics);
    const reasoning = chooseReasoning(settings, request.question, topics);
    const explicitCache = settings.model === 'gpt-5.6-sol';
    trace('provider.start', {
      id: request.id,
      model: settings.model,
      reasoning: reasoning ?? 'default',
      topics,
      instructionChars: instructions.length,
      historyChars: history.reduce((n, m) => n + m.content.length, 0),
      cacheMode: explicitCache ? 'explicit' : 'default',
    });
    const userText = formatAnswerContext(composeAnswerContext(request, settings), topics);
    const body = (effort: typeof reasoning) => ({
      model: settings.model,
      ...(effort ? { reasoning: { effort } } : {}),
      stream: true as const,
      store: false,
      ...(explicitCache
        ? { prompt_cache_options: { mode: 'explicit' as const } }
        : { instructions }),
      // Reasoning tokens count against this limit; leave room so answers are not cut off.
      max_output_tokens: effort && effort !== 'none' ? 12000 : 6000,
      input: [
        ...(explicitCache
          ? [
              {
                role: 'developer' as const,
                content: [
                  {
                    type: 'input_text' as const,
                    text: instructions,
                    prompt_cache_breakpoint: { mode: 'explicit' as const },
                  },
                ],
              },
            ]
          : []),
        ...history.map(({ role, content, images }) => ({
          role,
          content: images?.length
            ? [
                { type: 'input_text' as const, text: content },
                ...images.map((image) => ({
                  type: 'input_image' as const,
                  image_url: image.dataUrl,
                  detail: 'high' as const,
                })),
              ]
            : content,
        })),
        {
          role: 'user' as const,
          content: [
            { type: 'input_text' as const, text: userText },
            ...(request.images ?? []).map((image) => ({
              type: 'input_image' as const,
              image_url: image.dataUrl,
              detail: 'high' as const,
            })),
          ],
        },
      ],
    });
    let stream;
    try {
      stream = await client.responses.create(body(reasoning), { signal });
    } catch (error) {
      // A model that rejects the effort value still answers with its default reasoning.
      if (!reasoning || signal.aborted || !isReasoningRejected(error)) throw error;
      trace('provider.reasoning_rejected', { id: request.id, reasoning });
      stream = await client.responses.create(body(undefined), { signal });
    }
    trace('provider.connected', {
      id: request.id,
      durationMs: Math.round(performance.now() - started),
    });
    let first = true;
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        if (first) {
          first = false;
          trace('provider.first_delta', {
            id: request.id,
            durationMs: Math.round(performance.now() - started),
          });
        }
        yield { type: 'delta', text: event.delta };
      } else if (event.type === 'response.completed') {
        trace('provider.completed', {
          id: request.id,
          durationMs: Math.round(performance.now() - started),
          usage: event.response?.usage,
        });
        yield { type: 'complete' };
      } else if (
        event.type === 'response.failed' ||
        event.type === 'response.incomplete' ||
        event.type === 'error'
      )
        throw new Error('Provider did not complete the response');
    }
  };
}
export const openAIProvider = createOpenAIProvider();
export class AssistantService {
  private active?: { id: string; abort: AbortController };
  constructor(
    private provider: StreamProvider,
    private emit: (event: AppEvent) => void,
  ) {}
  cancel(): void {
    if (!this.active) return;
    const old = this.active;
    this.active = undefined;
    old.abort.abort();
    this.emit({ type: 'answer.cancelled', id: old.id });
  }
  async answer(request: AnswerRequest, settings: Settings, key: string): Promise<void> {
    this.cancel();
    const current = { id: request.id, abort: new AbortController() };
    this.active = current;
    let text = '';
    let completed = false;
    const timeout = setTimeout(() => {
      if (this.active === current) {
        this.emit({
          type: 'answer.error',
          id: request.id,
          message: 'The answer timed out. Try a shorter question or another model.',
        });
        this.cancel();
      }
    }, 120000);
    try {
      for await (const event of this.provider(request, settings, key, current.abort.signal)) {
        if (this.active !== current || current.abort.signal.aborted) return;
        if (event.type === 'delta') {
          text += event.text;
          if (text.length > 40000) throw new Error('Answer exceeds limit');
          this.emit({ type: 'answer.delta', id: request.id, text: event.text });
        } else completed = true;
      }
      if (this.active !== current) return;
      if (!completed) throw new Error('Incomplete stream');
      this.emit({ type: 'answer.done', id: request.id, text });
    } catch (error) {
      if (this.active === current && !current.abort.signal.aborted)
        this.emit({ type: 'answer.error', id: request.id, message: friendlyError(error) });
    } finally {
      clearTimeout(timeout);
      if (this.active === current) this.active = undefined;
    }
  }
}
