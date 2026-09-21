import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.editor.defineTheme('helper-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A737D' },
    { token: 'keyword', foreground: '8750A0' },
    { token: 'string', foreground: '196B45' },
  ],
  colors: {
    'editor.background': '#FAFAFA',
    'editor.foreground': '#242424',
    'editorLineNumber.foreground': '#808080',
    'editor.lineHighlightBackground': '#F0F0F0',
    'editor.selectionBackground': '#D7E6FA',
    'diffEditor.insertedLineBackground': '#EAF4ED',
    'diffEditor.removedLineBackground': '#FBECEC',
    'diffEditor.insertedTextBackground': '#BBDDC766',
    'diffEditor.removedTextBackground': '#E9B6B666',
  },
});
