import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.editor.defineTheme('helper-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '7C8DA7' },
    { token: 'keyword', foreground: 'B4A2FF' },
    { token: 'string', foreground: 'A8DCB8' },
  ],
  colors: {
    'editor.background': '#111721',
    'editor.foreground': '#DCE4F0',
    'editorLineNumber.foreground': '#526078',
    'editor.lineHighlightBackground': '#192231',
    'editor.selectionBackground': '#3B416C',
  },
});
