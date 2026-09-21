import type { SpeechDecision } from '../shared/contracts';
/** Assemble speech across pauses and discard decisions overtaken by newer audio. */
/** How long a `wait` may stand before the speaker's silence forces a decision. */
export const WAIT_FLOOR_MS = 3500;

export class SpeechQueue {
  private pending = '';
  private speaking = new Set<string>();
  private recent: string[] = [];
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private route: (
      text: string,
      recent: string[],
      speakerStopped: boolean,
    ) => Promise<SpeechDecision>,
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
  private async decide(epoch: number, speakerStopped = false): Promise<void> {
    const text = this.pending;
    this.status('Understanding');
    try {
      const decision = await this.route(text, [...this.recent], speakerStopped);
      if (epoch !== this.epoch) return;
      if (decision.action === 'wait' && !speakerStopped) {
        // A `wait` with nothing following it used to sit here forever: the question was
        // logged, the status read "Waiting for more", and no answer ever came. Silence
        // after a wait has to resolve, so re-ask once with the silence stated.
        this.status('Waiting for more');
        this.timer = setTimeout(() => void this.decide(epoch, true), WAIT_FLOOR_MS);
        return;
      }
      this.pending = '';
      const context = [...this.recent];
      this.recent = [...this.recent, text.slice(-1600)].slice(-12);
      // Told the speaker had stopped and still asking for more: nothing is coming, so
      // answer what we have rather than stall.
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
