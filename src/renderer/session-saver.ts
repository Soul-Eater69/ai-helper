import type { SavedSession } from '../shared/contracts';
/** Debounces edits, but keeps a flushable snapshot owned by its original session. */
export class SessionSaver {
  private pending?: SavedSession;
  private timer?: ReturnType<typeof setTimeout>;
  private writing: Promise<void> = Promise.resolve();
  constructor(
    private save: (value: SavedSession) => Promise<void>,
    private onError: (error: unknown) => void,
  ) {}
  get hasPending(): boolean {
    return !!this.pending;
  }
  schedule(snapshot: SavedSession): void {
    this.pending = structuredClone(snapshot);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(this.onError);
    }, 500);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    const previous = this.writing;
    this.writing = previous
      .catch(() => undefined)
      .then(async () => {
        const snapshot = this.pending;
        if (!snapshot) return;
        await this.save(snapshot);
        if (this.pending === snapshot) this.pending = undefined;
      });
    return this.writing;
  }
}
