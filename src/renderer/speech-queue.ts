import type { SpeechDecision } from '../shared/contracts';
/** Assemble speech across pauses and discard decisions overtaken by newer audio. */
export class SpeechQueue {
  private pending = '';
  private speaking = new Set<string>();
  private recent: string[] = [];
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private route: (text: string, recent: string[], finalize?: boolean) => Promise<SpeechDecision>,
    private answer: (text: string, recent: string[]) => void,
    private status: (text: string) => void,
    private error: (error: unknown) => void,
  ) {}
  partial(): void {
    this.epoch++;
    clearTimeout(this.timer);
    this.status('Listening');
  }
  started(id: string): void {
    this.partial();
    this.speaking.add(id);
  }
  final(text: string, id?: string): void {
    this.partial();
    if (id) this.speaking.delete(id);
    if (text.trim()) this.pending = `${this.pending} ${text}`.trim().slice(-20000);
    if (!this.pending || this.speaking.size) return;
    const epoch = this.epoch;
    this.timer = setTimeout(() => void this.decide(epoch), 1100);
  }
  stop(clearContext = false): void {
    this.partial();
    this.pending = '';
    this.speaking.clear();
    if (clearContext) this.recent = [];
    this.status('');
  }
  private async decide(epoch: number, finalize = false): Promise<void> {
    const text = this.pending;
    this.status('Understanding');
    try {
      const decision = finalize
        ? await this.route(text, [...this.recent], true)
        : await this.route(text, [...this.recent]);
      if (epoch !== this.epoch) return;
      if (decision.action === 'wait' && !finalize) {
        this.status('Brief pause — checking for more');
        this.timer = setTimeout(() => void this.decide(epoch, true), 1500);
        return;
      }
      this.pending = '';
      const context = [...this.recent];
      this.recent = [...this.recent, text.slice(-1600)].slice(-12);
      if (decision.action === 'answer' || decision.action === 'wait') {
        this.status('Answering');
        this.answer(text, context);
      } else this.status('Listening');
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.status('Repeat to retry');
      this.error(error);
    }
  }
}
