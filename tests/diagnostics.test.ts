import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Diagnostics } from '../src/main/diagnostics';
import { diagnosticSignalSchema } from '../src/shared/contracts';

it('exports ordered timestamped conversation events and redacts registered credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostics-'));
  const log = new Diagnostics(dir);
  try {
    log.protect('private-token');
    log.record('question', { text: 'hello private-token sk-testsecret' });
    await log.flush();
    log.record('answer', { text: 'hi' });
    const rows = (await log.snapshot())
      .trim()
      .split('\n')
      .map((x) => JSON.parse(x));
    expect(rows.map((x) => x.event)).toEqual(['question', 'answer']);
    expect(rows[0].details.text).toBe('hello [REDACTED] [REDACTED]');
    expect(rows[0].run).toBe(rows[1].run);
    expect(rows[1].elapsedMs).toBeGreaterThanOrEqual(rows[0].elapsedMs);
  } finally {
    await log.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it('rotates bounded files and keeps previous run evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostics-'));
  const log = new Diagnostics(dir, 300);
  try {
    log.record('first', { text: 'x'.repeat(150) });
    await log.flush();
    log.record('second', { text: 'y'.repeat(150) });
    await log.flush();
    expect(await readFile(join(dir, 'previous.jsonl'), 'utf8')).toContain('first');
    expect(await log.snapshot()).toContain('second');
  } finally {
    await log.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it('rejects arbitrary renderer log payloads', () => {
  expect(
    diagnosticSignalSchema.safeParse({ event: 'renderer.heartbeat', key: 'secret' }).success,
  ).toBe(false);
  expect(diagnosticSignalSchema.safeParse({ event: 'anything' }).success).toBe(false);
});

it('caps queued records and reports dropped evidence explicitly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostics-'));
  const log = new Diagnostics(dir);
  try {
    log.record('oversized', { text: 'x'.repeat(3 * 1024 * 1024) });
    const output = await log.snapshot();
    expect(output).toContain('diagnostics.dropped');
    expect(output.length).toBeLessThan(1000);
  } finally {
    await log.close();
    await rm(dir, { recursive: true, force: true });
  }
});
