import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';

const options: monaco.editor.IStandaloneEditorConstructionOptions = {
  theme: 'helper-dark',
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 23,
  fontFamily: "'Cascadia Code', Consolas, monospace",
  padding: { top: 20 },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 4,
  wordWrap: 'on',
  renderLineHighlight: 'all',
  accessibilitySupport: 'on',
  editContext: false,
};
export function CodeEditor({
  value,
  language,
  onChange,
}: {
  value: string;
  language: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const initial = useRef({ value, language });
  useEffect(() => {
    const model = monaco.editor.createModel(initial.current.value, initial.current.language);
    const instance = monaco.editor.create(host.current!, {
      ...options,
      model,
      ariaLabel: 'Working code editor',
    });
    editor.current = instance;
    const subscription = instance.onDidChangeModelContent(() =>
      change.current(instance.getValue()),
    );
    return () => {
      subscription.dispose();
      instance.setModel(null);
      instance.dispose();
      model.dispose();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    if (editor.current && editor.current.getValue() !== value) editor.current.setValue(value);
  }, [value]);
  useEffect(() => {
    const model = editor.current?.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [language]);
  return <div ref={host} className="monaco-surface" data-testid="working-editor" />;
}
export function CodeDiff({
  original,
  modified,
  language,
}: {
  original: string;
  modified: string;
  language: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const originalModel = monaco.editor.createModel(original, language);
    const modifiedModel = monaco.editor.createModel(modified, language);
    const instance = monaco.editor.createDiffEditor(host.current!, {
      ...options,
      readOnly: true,
      renderSideBySide: false,
      originalEditable: false,
    });
    instance.setModel({ original: originalModel, modified: modifiedModel });
    // Detach before disposing models; otherwise Monaco emits a lifecycle error.
    return () => {
      instance.setModel(null);
      instance.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [original, modified, language]);
  return <div ref={host} className="monaco-surface" data-testid="code-diff" />;
}
