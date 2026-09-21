import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, AppEvent } from '../shared/contracts';
const api: DesktopAPI = {
  isDesktop: true,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  setKey: (key) => ipcRenderer.invoke('key:set', key),
  deleteKey: () => ipcRenderer.invoke('key:delete'),
  answer: (request) => ipcRenderer.invoke('answer:start', request),
  cancel: () => ipcRenderer.invoke('answer:cancel'),
  startAudio: (source) => ipcRenderer.invoke('audio:start', source),
  stopAudio: () => ipcRenderer.invoke('audio:stop'),
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
