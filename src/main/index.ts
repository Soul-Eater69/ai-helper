import { writeFile } from 'node:fs/promises';
import { Diagnostics } from './diagnostics';
import { PROMPT_VERSION } from '../shared/prompts';
import { app, BrowserWindow, ipcMain, safeStorage, session, desktopCapturer } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { imageAttachmentSchema } from '../shared/images';
import { withoutCaptureOverlay } from './screenshot';
import { RequestGate } from '../shared/request-gate';
import { Vault } from './storage';
import { createOpenAIProvider } from './assistant';
import { SessionController } from './session-controller';
import { SpeechService } from './speech';
import { TranscriptionService, transcriptionVocabulary } from './transcription';
import {
  diagnosticSignalSchema,
  settingsSchema,
  answerRequestSchema,
  speechRequestSchema,
  savedSessionSchema,
  type AppEvent,
} from '../shared/contracts';

let diagnostics: Diagnostics | undefined;
let window: BrowserWindow | undefined;
let assistant: SessionController;
let transcription: TranscriptionService;
let captureGrant: { source: 'system' | 'microphone'; expires: number } | undefined;
let startEpoch = 0;
const speechGate = new RequestGate();
const speech = new SpeechService();
const cancelSpeech = () => {
  diagnostics?.record('router.cancel');
  speechGate.cancel();
  speech.cancel();
};
const dev = !app.isPackaged && process.env.AI_HELPER_DEV === '1';
const entry = dev
  ? 'http://127.0.0.1:5173/'
  : pathToFileURL(join(__dirname, '../renderer/index.html')).href;
const emit = (event: AppEvent) => {
  diagnostics?.record(event.type, event);
  if (window && !window.isDestroyed()) window.webContents.send('app:event', event);
};

function trusted(url: string): boolean {
  return url === entry || (dev && url.startsWith('http://127.0.0.1:5173/'));
}
async function boot(): Promise<void> {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error(
      'OS encrypted storage is unavailable. AI Helper requires Windows credential encryption.',
    );
  const vault = new Vault(app.getPath('userData'), {
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  });
  diagnostics = new Diagnostics(join(app.getPath('userData'), 'diagnostics'));
  diagnostics.protect((await vault.key()) ?? '');
  diagnostics.record('app.start', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    promptVersion: PROMPT_VERSION,
  });
  let chunks = 0,
    bytes = 0,
    lastChunkAt = 0,
    lastRendererAt = 0;
  let expectedBeat = performance.now() + 5000;
  const heartbeat = setInterval(() => {
    diagnostics?.record('app.heartbeat', {
      lagMs: Math.max(0, Math.round(performance.now() - expectedBeat)),
      transcription: transcription?.diagnostics(),
      audioChunks: chunks,
      audioBytes: bytes,
      lastChunkAt,
      lastRendererAt,
    });
    expectedBeat = performance.now() + 5000;
    chunks = 0;
    bytes = 0;
  }, 5000);
  heartbeat.unref();
  assistant = new SessionController(
    createOpenAIProvider((event, data) => diagnostics?.record(event, data)),
    emit,
    async () => {
      const key = await vault.key();
      if (!key) throw new Error('Add your OpenAI API key in Settings first.');
      return { key, settings: await vault.settings() };
    },
    (event, data) => diagnostics?.record(event, data),
  );
  transcription = new TranscriptionService(emit, (event, details) =>
    diagnostics?.record(event, details),
  );
  window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#0c1017',
    title: 'AI Helper',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const handle = (channel: string, fn: (input: unknown) => unknown) =>
    ipcMain.handle(channel, async (event, input) => {
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        !trusted(event.senderFrame.url)
      )
        throw new Error('Untrusted request');
      const started = performance.now();
      const callId = crypto.randomUUID();
      // Only validated, explicitly selected request fields are logged below.
      diagnostics?.record('ipc.start', { channel, callId });
      try {
        const result = await fn(input);
        diagnostics?.record('ipc.done', {
          channel,
          callId,
          durationMs: Math.round(performance.now() - started),
        });
        return result;
      } catch (error) {
        diagnostics?.record('ipc.error', {
          channel,
          callId,
          durationMs: Math.round(performance.now() - started),
        });
        throw error;
      }
    });
  handle('settings:get', async () => ({
    settings: await vault.settings(),
    hasKey: !!(await vault.key()),
  }));
  handle('settings:save', (input) => vault.saveSettings(settingsSchema.parse(input)));
  handle('key:set', (input) => {
    const key = z.string().trim().min(10).max(500).parse(input);
    diagnostics?.protect(key);
    return vault.setKey(key);
  });
  handle('key:delete', async () => {
    cancelSpeech();
    assistant.cancel();
    transcription.stop();
    captureGrant = undefined;
    startEpoch++;
    await vault.setKey('');
  });
  handle('answer:start', async (input) => {
    const request = answerRequestSchema.parse(input);
    diagnostics?.record('answer.request', {
      id: request.id,
      question: request.question,
      historyCount: request.history.length,
      historyChars: request.history.reduce((n, x) => n + x.content.length, 0),
      codeChars: request.code.length,
      contextChars: request.context.length,
      imageCount: request.images?.length ?? 0,
    });
    await assistant.answer(request);
  });
  handle('answer:prepare', (input) => assistant.prepare(answerRequestSchema.parse(input)));
  handle('answer:discard', (input) => assistant.discard(z.string().min(1).max(100).parse(input)));
  handle('answer:cancel', () => {
    cancelSpeech();
    assistant.cancel();
  });
  // Capture is a user-selected still image, separate from the live audio grant.
  let captureSources = new Set<string>();
  let captureExpires = 0;
  handle('capture:list', async () => {
    captureSources.clear();
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    });
    const choices = sources.filter((source) => source.name !== 'AI Helper').slice(0, 40);
    captureSources = new Set(choices.map((source) => source.id));
    captureExpires = Date.now() + 60000;
    return choices.map((source) => ({
      id: source.id,
      name: source.name,
      preview: source.thumbnail.toDataURL(),
    }));
  });
  handle('capture:image', async (input) => {
    const id = z.string().min(1).max(200).parse(input);
    if (!captureSources.has(id) || Date.now() > captureExpires)
      throw new Error('Choose a screen or window again.');
    captureSources.clear();
    const takeSnapshot = () =>
      desktopCapturer.getSources({
        types: [id.startsWith('screen:') ? 'screen' : 'window'],
        thumbnailSize: { width: 1920, height: 1080 },
      });
    const sources = id.startsWith('screen:')
      ? await withoutCaptureOverlay(window, takeSnapshot)
      : await takeSnapshot();
    const selected = sources.find((source) => source.id === id);
    if (!selected || selected.thumbnail.isEmpty())
      throw new Error('Could not capture this window. Try another screen or paste a screenshot.');
    return imageAttachmentSchema.parse({
      id: crypto.randomUUID(),
      name: selected.name.slice(0, 160),
      dataUrl: `data:image/jpeg;base64,${selected.thumbnail.toJPEG(90).toString('base64')}`,
    });
  });
  handle('speech:route', async (input) => {
    const request = speechRequestSchema.parse(input);
    const ticket = speechGate.begin();
    speech.cancel();
    const key = await vault.key();
    if (!key) throw new Error('Add your OpenAI API key in Settings first.');
    const settings = await vault.settings();
    if (!speechGate.isCurrent(ticket)) return { action: 'ignore' };
    const routeId = crypto.randomUUID();
    diagnostics?.record('router.start', {
      routeId,
      answerId: request.answerId,
      model: settings.routerModel || settings.model,
      text: request.text,
      finalize: request.finalize,
    });
    const started = performance.now();
    try {
      const decision = await speech.route(request, settings, key);
      diagnostics?.record('router.done', {
        routeId,
        decision,
        durationMs: Math.round(performance.now() - started),
        current: speechGate.isCurrent(ticket),
      });
      return decision;
    } catch (error) {
      diagnostics?.record('router.error', {
        routeId,
        durationMs: Math.round(performance.now() - started),
      });
      throw error;
    }
  });
  handle('speech:cancel', cancelSpeech);
  handle('audio:start', async (input) => {
    const source = z.enum(['system', 'microphone']).parse(input);
    diagnostics?.record('audio.start', { source });
    const epoch = ++startEpoch;
    const key = await vault.key();
    if (!key) throw new Error('Add your OpenAI API key in Settings first.');
    const settings = await vault.settings();
    if (epoch !== startEpoch) return;
    diagnostics?.record('audio.config', {
      model: settings.transcriptionModel,
      autoAnswer: settings.autoAnswer,
    });
    await transcription.start(
      key,
      settings.transcriptionModel,
      transcriptionVocabulary(settings.candidateName),
    );
    if (epoch !== startEpoch) return;
    captureGrant = { source, expires: Date.now() + 30000 };
  });
  handle('audio:stop', (input) => {
    const finish = z.boolean().optional().parse(input);
    diagnostics?.record('audio.stop', { finish: !!finish });
    startEpoch++;
    captureGrant = undefined;
    if (finish) return transcription.finish();
    transcription.stop();
  });
  handle('diagnostics:export', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showSaveDialog(window!, {
      title: 'Export diagnostics — includes conversation text',
      defaultPath: `ai-helper-diagnostics-${Date.now()}.jsonl`,
      filters: [{ name: 'Diagnostic log', extensions: ['jsonl'] }],
    });
    if (result.canceled || !result.filePath) return false;
    const snapshot = await diagnostics!.snapshot();
    await writeFile(result.filePath, snapshot, { mode: 0o600 });
    return true;
  });
  ipcMain.on('diagnostics:signal', (event, input) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !trusted(event.senderFrame.url)
    )
      return;
    const parsed = diagnosticSignalSchema.safeParse(input);
    if (!parsed.success) return;
    if (parsed.data.event === 'renderer.heartbeat') lastRendererAt = Date.now();
    diagnostics?.record(parsed.data.event, parsed.data);
  });
  window.on('unresponsive', () => diagnostics?.record('renderer.unresponsive'));
  window.on('responsive', () => diagnostics?.record('renderer.responsive'));
  handle('sessions:list', () => vault.sessions());
  handle('sessions:save', (input) => vault.saveSession(savedSessionSchema.parse(input)));
  handle('sessions:delete', (input) => vault.deleteSession(z.string().max(100).parse(input)));
  ipcMain.on('audio:chunk', (event, input) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      return;
    if (
      !(input instanceof ArrayBuffer) ||
      input.byteLength === 0 ||
      input.byteLength > 19200 ||
      input.byteLength % 2 !== 0
    )
      return;
    chunks++;
    bytes += input.byteLength;
    lastChunkAt = Date.now();
    transcription.append(input);
  });
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission) =>
      contents === window?.webContents &&
      (permission === 'media' || permission === 'display-capture') &&
      !!captureGrant &&
      captureGrant.expires > Date.now(),
  );
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(
      contents === window?.webContents &&
        (permission === 'media' || permission === 'display-capture') &&
        !!captureGrant &&
        captureGrant.expires > Date.now(),
    );
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (
      request.frame !== window?.webContents.mainFrame ||
      captureGrant?.source !== 'system' ||
      captureGrant.expires < Date.now()
    ) {
      callback({});
      return;
    }
    captureGrant = undefined;
    try {
      // Chromium requires a video source for getDisplayMedia; video never leaves this app.
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      });
      if (!sources.length) {
        callback({});
        return;
      }
      callback({ video: sources[0], audio: 'loopback' });
    } catch {
      callback({});
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => {
    diagnostics?.record('renderer.gone', { reason: details.reason, exitCode: details.exitCode });
    cancelSpeech();
    startEpoch++;
    assistant.cancel();
    transcription.stop();
  });
  window.on('closed', () => {
    clearInterval(heartbeat);
    diagnostics?.record('app.window.closed');
    void diagnostics?.close();
    cancelSpeech();
    startEpoch++;
    assistant.cancel();
    transcription.stop();
    window = undefined;
  });
  await window.loadURL(entry);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(boot)
    .catch(async (error) => {
      const { dialog } = await import('electron');
      dialog.showErrorBox(
        'AI Helper could not start',
        error instanceof Error ? error.message : 'Startup failed',
      );
      app.quit();
    });
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting || !diagnostics) return;
    event.preventDefault();
    quitting = true;
    void diagnostics.close().finally(() => app.quit());
  });
  app.on('window-all-closed', () => app.quit());
}
