import { isBehaviouralQuestion, selectStories, renderStory } from '../shared/story-bank';
import OpenAI from 'openai';
import { buildInstructions } from '../shared/prompts';
import { deduplicateCodeHistory } from '../shared/history';
import type { AppEvent, AnswerRequest, Settings } from '../shared/contracts';
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
/** Resolve stored facts in main; short follow-ups reuse the nearest behavioral question. */
export function composeAnswerContext(request: AnswerRequest, settings: Settings) {
  let storyQuestion = request.question;
  const isFollowUp = (text: string) =>
    /^(?:and |okay[, ]+|so )?(?:how did|why did|what did|what happened|what was|what were|who |tell me more|go deeper|explain that|can you elaborate)/i.test(
      text.trim(),
    );
  if (!isBehaviouralQuestion(storyQuestion) && isFollowUp(storyQuestion)) {
    for (const turn of [...request.history].reverse()) {
      if (turn.role !== 'user') continue;
      if (isBehaviouralQuestion(turn.content)) {
        storyQuestion = turn.content;
        break;
      }
      if (!isFollowUp(turn.content)) break;
    }
  }
  return {
    question: request.question,
    pinnedContext: request.context,
    recentSpokenContext: request.speechContext ?? [],
    language: request.language,
    currentCode: request.code,
    codeSource: request.codeSource ?? 'working',
    experienceFacts: settings.profile,
    relevantExperiences: selectStories(storyQuestion, settings.stories).map((entry) =>
      renderStory(entry.story),
    ),
  };
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
    const instructions = buildInstructions(settings);
    const history = deduplicateCodeHistory(request.history, request.code);
    const explicitCache = settings.model === 'gpt-5.6-sol';
    trace('provider.start', {
      id: request.id,
      model: settings.model,
      reasoning: settings.answerReasoning,
      instructionChars: instructions.length,
      historyChars: history.reduce((n, m) => n + m.content.length, 0),
      cacheMode: explicitCache ? 'explicit' : 'default',
    });
    const stream = await client.responses.create(
      {
        model: settings.model,
        ...(settings.model === 'gpt-5.6-sol' && settings.answerReasoning !== 'auto'
          ? { reasoning: { effort: settings.answerReasoning } }
          : {}),
        stream: true,
        store: false,
        ...(explicitCache
          ? { prompt_cache_options: { mode: 'explicit' as const } }
          : { instructions }),
        max_output_tokens: 6000,
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
            role: 'user',
            content: [
              { type: 'input_text', text: JSON.stringify(composeAnswerContext(request, settings)) },
              ...(request.images ?? []).map((image) => ({
                type: 'input_image' as const,
                image_url: image.dataUrl,
                detail: 'high' as const,
              })),
            ],
          },
        ],
      },
      { signal },
    );
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
