import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantService, type StreamProvider } from '../src/main/assistant';
import { Vault } from '../src/main/storage';
import { settingsSchema, type AppEvent, type AnswerRequest } from '../src/shared/contracts';

const req = (id: string): AnswerRequest => ({
  id,
  question: 'Design a parking lot',
  context: '',
  code: '',
  codeVersion: 0,
  language: 'python',
  history: [],
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('stream lifecycle', () => {
  it('rejects late output from an interrupted request', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: StreamProvider = async function* (request) {
      if (request.id === 'old') await waiting;
      yield { type: 'delta', text: request.id };
      yield { type: 'complete' };
    };
    const events: AppEvent[] = [];
    const service = new AssistantService(provider, (event) => events.push(event));
    const old = service.answer(req('old'), settingsSchema.parse({}), 'key');
    const next = service.answer(req('new'), settingsSchema.parse({}), 'key');
    release();
    await Promise.all([old, next]);
    expect(events.filter((e) => e.type === 'answer.delta').map((e) => e.id)).toEqual(['new']);
    expect(events.filter((e) => e.type === 'answer.done').map((e) => e.id)).toEqual(['new']);
  });
  it('does not treat an incomplete stream as a successful code proposal', async () => {
    const provider: StreamProvider = async function* () {
      yield { type: 'delta', text: 'partial' };
    };
    const events: AppEvent[] = [];
    await new AssistantService(provider, (e) => events.push(e)).answer(
      req('x'),
      settingsSchema.parse({}),
      'key',
    );
    expect(events.some((e) => e.type === 'answer.done')).toBe(false);
    expect(events.some((e) => e.type === 'answer.error')).toBe(true);
  });
  it('explicit cancellation produces no final answer', async () => {
    const provider: StreamProvider = async function* () {
      await tick();
      yield { type: 'complete' };
    };
    const events: AppEvent[] = [];
    const service = new AssistantService(provider, (e) => events.push(e));
    const promise = service.answer(req('x'), settingsSchema.parse({}), 'key');
    service.cancel();
    await promise;
    expect(events.some((e) => e.type === 'answer.done')).toBe(false);
  });
});

describe('local vault', () => {
  const codec = {
    encrypt: (text: string) => Buffer.from(text).reverse(),
    decrypt: (data: Buffer) => Buffer.from(data).reverse().toString(),
  };
  it('serializes concurrent settings and key writes without losing either', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ai-helper-'));
    const vault = new Vault(dir, codec);
    await Promise.all([
      vault.setKey('test-secret'),
      vault.setDeepgramKey('deepgram-secret'),
      vault.saveSettings(settingsSchema.parse({ model: 'my-model' })),
    ]);
    const loaded = new Vault(dir, codec);
    expect(await loaded.key()).toBe('test-secret');
    expect(await loaded.deepgramKey()).toBe('deepgram-secret');
    expect((await readFile(join(dir, 'vault.bin'))).toString()).not.toContain('deepgram-secret');
    await loaded.setDeepgramKey('');
    expect(await loaded.deepgramKey()).toBe('');
    expect(await loaded.key()).toBe('test-secret');
    expect((await loaded.settings()).model).toBe('my-model');
    expect((await readFile(join(dir, 'vault.bin'))).toString()).not.toContain('test-secret');
  });
  it('reports damaged storage without silently overwriting it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ai-helper-'));
    await writeFile(join(dir, 'vault.bin'), 'broken');
    const vault = new Vault(dir, codec);
    await expect(vault.settings()).rejects.toThrow(/storage/i);
    expect((await readFile(join(dir, 'vault.bin'))).toString()).toBe('broken');
  });
});
