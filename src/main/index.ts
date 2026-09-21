import { app, BrowserWindow, ipcMain, safeStorage, session, desktopCapturer } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { RequestGate } from '../shared/request-gate';
import { Vault } from './storage';
import { AssistantService, openAIProvider } from './assistant';
import { SpeechService } from './speech';
import { TranscriptionService } from './transcription';
import {
  settingsSchema,
  answerRequestSchema,
  speechRequestSchema,
  savedSessionSchema,
  type AppEvent,
} from '../shared/contracts';

let window: BrowserWindow | undefined;
let assistant: AssistantService;
let transcription: TranscriptionService;
let captureGrant: { source: 'system' | 'microphone'; expires: number } | undefined;
let startEpoch = 0;
const answerGate = new RequestGate();
const speechGate = new RequestGate();
const speech = new SpeechService();
const cancelSpeech = () => {
  speechGate.cancel();
  speech.cancel();
};
const dev = !app.isPackaged && process.env.AI_HELPER_DEV === '1';
const entry = dev
  ? 'http://127.0.0.1:5173/'
  : pathToFileURL(join(__dirname, '../renderer/index.html')).href;
const emit = (event: AppEvent) => {
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
  assistant = new AssistantService(openAIProvider, emit);
  transcription = new TranscriptionService(emit);
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
      return fn(input);
    });
  handle('settings:get', async () => ({
    settings: await vault.settings(),
    hasKey: !!(await vault.key()),
  }));
  handle('settings:save', (input) => vault.saveSettings(settingsSchema.parse(input)));
  handle('key:set', (input) => vault.setKey(z.string().trim().min(10).max(500).parse(input)));
  handle('key:delete', async () => {
    cancelSpeech();
    answerGate.cancel();
    assistant.cancel();
    transcription.stop();
    captureGrant = undefined;
    startEpoch++;
    await vault.setKey('');
  });
  handle('answer:start', async (input) => {
    const request = answerRequestSchema.parse(input);
    const ticket = answerGate.begin();
    assistant.cancel();
    const key = await vault.key();
    if (!key) throw new Error('Add your OpenAI API key in Settings first.');
    const settings = await vault.settings();
    if (answerGate.isCurrent(ticket)) void assistant.answer(request, settings, key);
  });
  handle('answer:cancel', () => {
    cancelSpeech();
    answerGate.cancel();
    assistant.cancel();
  });
  handle('speech:route', async (input) => {
    const request = speechRequestSchema.parse(input);
    const ticket = speechGate.begin();
    speech.cancel();
    const key = await vault.key();
    if (!key) throw new Error('Add your OpenAI API key in Settings first.');
    const settings = await vault.settings();
    if (!speechGate.isCurrent(ticket)) return { action: 'ignore' };
    return speech.route(request, settings, key);
  });
  handle('speech:cancel', cancelSpeech);
  handle('audio:start', async (input) => {
    const source = z.enum(['system', 'microphone']).parse(input);
    const epoch = ++startEpoch;
    const key = await vault.key();
    if (!key) throw new Error('Add your OpenAI API key in Settings first.');
    const settings = await vault.settings();
    if (epoch !== startEpoch) return;
    await transcription.start(key, settings.transcriptionModel);
    if (epoch !== startEpoch) return;
    captureGrant = { source, expires: Date.now() + 30000 };
  });
  handle('audio:stop', () => {
    cancelSpeech();
    startEpoch++;
    captureGrant = undefined;
    transcription.stop();
  });
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
  window.webContents.on('render-process-gone', () => {
    cancelSpeech();
    answerGate.cancel();
    startEpoch++;
    assistant.cancel();
    transcription.stop();
  });
  window.on('closed', () => {
    cancelSpeech();
    answerGate.cancel();
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
  app.on('window-all-closed', () => app.quit());
}
