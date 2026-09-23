import { AssistantService, type StreamProvider } from './assistant';
import type { AnswerRequest, AppEvent, Settings } from '../shared/contracts';

type Connection = { settings: Settings; key: string };
type Draft = {
  request: AnswerRequest;
  connection?: Connection;
  service?: AssistantService;
  text: string;
  terminal?: AppEvent;
  published: boolean;
  expired: boolean;
  timer?: ReturnType<typeof setTimeout>;
  startedAt: number;
};

/** Owns publication: speculative work can never emit UI events before an explicit commit. */
export class SessionController {
  private draft?: Draft;
  private foreground?: AssistantService;
  private epoch = 0;
  private committed = new Set<string>();
  private preparationStarts: number[] = [];
  constructor(
    private provider: StreamProvider,
    private emit: (event: AppEvent) => void,
    private connection: () => Promise<Connection>,
    private trace: (event: string, data: Record<string, unknown>) => void = () => {},
  ) {}

  async prepare(request: AnswerRequest): Promise<void> {
    if (this.committed.has(request.id)) return;
    this.discard();
    const now = Date.now();
    this.preparationStarts = this.preparationStarts.filter((time) => now - time < 30000);
    if (this.preparationStarts.length >= 6) {
      this.trace('session.preparation_limited', { id: request.id });
      return;
    }
    const draft: Draft = {
      request,
      text: '',
      published: false,
      expired: false,
      startedAt: performance.now(),
    };
    this.draft = draft;
    // Bound the lifetime even if credential setup or the provider never returns.
    draft.timer = setTimeout(() => this.discard(request.id), 30000);
    try {
      const connection = await this.connection();
      if (this.draft !== draft || draft.expired) return;
      if (!connection.settings.earlyPreparation) {
        this.discard(request.id);
        return;
      }
      draft.connection = connection;
      this.preparationStarts.push(Date.now());
      draft.service = new AssistantService(this.provider, (event) => {
        if (draft.expired) return;
        if (draft.published) {
          this.emit(event);
          return;
        }
        if (event.type === 'answer.delta') draft.text += event.text;
        else draft.terminal = event;
      });
      this.trace('session.prepare', { id: request.id });
      void draft.service.answer(request, connection.settings, connection.key);
    } catch {
      // An optional preparation failure must not prevent the authorized request later.
      if (this.draft === draft) this.discard(request.id);
      this.trace('session.prepare_failed', { id: request.id });
    }
  }

  discard(id?: string): void {
    const draft = this.draft;
    if (!draft || (id && draft.request.id !== id)) return;
    this.draft = undefined;
    draft.expired = true;
    clearTimeout(draft.timer);
    draft.service?.cancel();
    this.trace('session.discard', { id: draft.request.id, generatedChars: draft.text.length });
  }

  async answer(request: AnswerRequest): Promise<void> {
    if (this.committed.has(request.id)) return;
    this.committed.add(request.id);
    if (this.committed.size > 100) this.committed.delete(this.committed.values().next().value!);
    const epoch = ++this.epoch;
    this.foreground?.cancel();
    this.foreground = undefined;
    try {
      const connection = await this.connection();
      if (epoch !== this.epoch) return;
      const draft = this.draft;
      const reusable =
        draft?.service &&
        !draft.expired &&
        connection.settings.earlyPreparation &&
        (!draft.terminal || draft.terminal.type === 'answer.done') &&
        JSON.stringify(draft.request) === JSON.stringify(request) &&
        JSON.stringify(draft.connection?.settings) === JSON.stringify(connection.settings) &&
        draft.connection?.key === connection.key;
      if (draft && reusable) {
        clearTimeout(draft.timer);
        this.draft = undefined;
        draft.published = true;
        this.foreground = draft.service;
        this.trace('session.commit', {
          id: request.id,
          preparedMs: Math.round(performance.now() - draft.startedAt),
          bufferedChars: draft.text.length,
        });
        if (draft.text) this.emit({ type: 'answer.delta', id: request.id, text: draft.text });
        if (draft.terminal) this.emit(draft.terminal);
        draft.text = '';
      } else {
        this.discard();
        this.trace('session.generate', { id: request.id });
        this.foreground = new AssistantService(this.provider, this.emit);
        void this.foreground.answer(request, connection.settings, connection.key);
      }
    } catch (error) {
      if (epoch === this.epoch) this.discard();
      throw error;
    }
  }

  cancel(): void {
    this.epoch++;
    this.discard();
    this.foreground?.cancel();
    this.foreground = undefined;
  }
}
