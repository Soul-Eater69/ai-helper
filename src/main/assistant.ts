import { isBehaviouralQuestion, selectStories, renderStory } from '../shared/story-bank';
import OpenAI from 'openai';
import { buildInstructions } from '../shared/prompts';
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
export const openAIProvider: StreamProvider = async function* (request, settings, key, signal) {
  const client = new OpenAI({ apiKey: key, maxRetries: 1, timeout: 60000 });
  const stream = await client.responses.create(
    {
      model: settings.model,
      ...(settings.model === 'gpt-5.6-sol' && settings.answerReasoning !== 'auto'
        ? { reasoning: { effort: settings.answerReasoning } }
        : {}),
      stream: true,
      store: false,
      instructions: buildInstructions(settings),
      max_output_tokens: 6000,
      input: [
        ...request.history,
        {
          role: 'user',
          content: JSON.stringify(composeAnswerContext(request, settings)),
        },
      ],
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') yield { type: 'delta', text: event.delta };
    else if (event.type === 'response.completed') yield { type: 'complete' };
    else if (
      event.type === 'response.failed' ||
      event.type === 'response.incomplete' ||
      event.type === 'error'
    )
      throw new Error('Provider did not complete the response');
  }
};
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
