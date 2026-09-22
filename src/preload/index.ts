import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, AppEvent } from '../shared/contracts';
const api: DesktopAPI = {
  isDesktop: true,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  setKey: (key) => ipcRenderer.invoke('key:set', key),
  deleteKey: () => ipcRenderer.invoke('key:delete'),
  answer: (request) => ipcRenderer.invoke('answer:start', request),
  listCaptureSources: () => ipcRenderer.invoke('capture:list'),
  captureImage: (sourceId) => ipcRenderer.invoke('capture:image', sourceId),
  cancel: () => ipcRenderer.invoke('answer:cancel'),
  routeSpeech: (request) => ipcRenderer.invoke('speech:route', request),
  cancelSpeech: () => ipcRenderer.invoke('speech:cancel'),
  startAudio: (source) => ipcRenderer.invoke('audio:start', source),
  stopAudio: (finish) => ipcRenderer.invoke('audio:stop', finish),
  sendAudio: (data) => ipcRenderer.send('audio:chunk', data),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: AppEvent) => callback(value);
    ipcRenderer.on('app:event', listener);
    return () => {
      ipcRenderer.removeListener('app:event', listener);
    };
  },
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  saveSession: (session) => ipcRenderer.invoke('sessions:save', session),
  deleteSession: (id) => ipcRenderer.invoke('sessions:delete', id),
};
contextBridge.exposeInMainWorld('desktop', api);
