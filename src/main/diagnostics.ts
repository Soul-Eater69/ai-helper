import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Bounded, buffered diagnostics. Never pass credentials, raw audio or images here. */
export class Diagnostics {
  private queue: string[] = [];
  private queuedBytes = 0;
  private dropped = 0;
  private chain = Promise.resolve();
  private secrets = new Set<string>();
  private run = randomUUID();
  private start = performance.now();
  private timer: ReturnType<typeof setInterval>;
  private failed = false;
  private writing = false;
  private exporting = 0;
  constructor(
    private directory: string,
    private maxBytes = 8 * 1024 * 1024,
  ) {
    this.timer = setInterval(() => void this.flush(), 1000);
    this.timer.unref();
  }
  protect(secret: string) {
    if (secret) this.secrets.add(secret);
  }
  record(event: string, details: unknown = {}) {
    let line = JSON.stringify({
      at: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - this.start),
      run: this.run,
      event,
      details,
    });
    for (const secret of this.secrets) line = line.split(secret).join('[REDACTED]');
    line = line.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
    const size = Buffer.byteLength(line) + 1;
    if (this.queuedBytes + size > 2 * 1024 * 1024) {
      this.dropped++;
      return;
    }
    this.queue.push(line);
    this.queuedBytes += size;
  }
  flush(): Promise<void> {
    if (this.writing || this.exporting) return this.chain;
    // Snapshot before queuing disk work; never block the audio callback on I/O.
    if (!this.queue.length && !this.dropped) return this.chain;
    const rows = this.queue;
    this.queue = [];
    this.queuedBytes = 0;
    if (this.dropped)
      rows.push(
        JSON.stringify({
          at: new Date().toISOString(),
          run: this.run,
          event: 'diagnostics.dropped',
          count: this.dropped,
        }),
      );
    this.dropped = 0;
    const batch = rows.join('\n') + '\n';
    this.writing = true;
    this.chain = this.chain
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        const file = join(this.directory, 'current.jsonl');
        const size = await stat(file).then(
          (s) => s.size,
          () => 0,
        );
        if (size + Buffer.byteLength(batch) > this.maxBytes) {
          await rm(join(this.directory, 'previous.jsonl'), { force: true });
          if (size) await rename(file, join(this.directory, 'previous.jsonl'));
        }
        await appendFile(file, batch, { mode: 0o600 });
      })
      .catch(() => {
        this.failed = true;
      })
      .finally(() => {
        this.writing = false;
      });
    return this.chain;
  }
  async snapshot(): Promise<string> {
    await this.chain;
    await this.flush();
    if (this.failed)
      throw new Error('Diagnostics could not be fully written. Check available disk space.');
    const read = (name: string) =>
      readFile(join(this.directory, name), 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
    this.exporting++;
    try {
      return (await read('previous.jsonl')) + (await read('current.jsonl'));
    } finally {
      this.exporting--;
    }
  }
  async close() {
    clearInterval(this.timer);
    await this.chain;
    await this.flush();
  }
}
