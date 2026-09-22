import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';

const options: monaco.editor.IStandaloneEditorConstructionOptions = {
  theme: 'helper-light',
  minimap: { enabled: false },
  fontSize: 14,
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
  readOnly = false,
}: {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const change = useRef(onChange);
  change.current = readOnly ? undefined : onChange;
  const initial = useRef({ value, language });
  useEffect(() => {
    const model = monaco.editor.createModel(initial.current.value, initial.current.language);
    const instance = monaco.editor.create(host.current!, {
      ...options,
      model,
      readOnly,
      ariaLabel: readOnly ? 'Historical code viewer' : 'Working code editor',
    });
    editor.current = instance;
    const subscription = instance.onDidChangeModelContent(() =>
      change.current?.(instance.getValue()),
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
  return (
    <div
      ref={host}
      className="monaco-surface"
      data-testid={readOnly ? 'history-editor' : 'working-editor'}
    />
  );
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
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const changes = useRef<monaco.editor.ILineChange[]>([]);
  const [summary, setSummary] = useState({
    count: 0,
    added: 0,
    removed: 0,
    current: 0,
    ready: false,
  });
  const navigate = (direction: number) => {
    if (!changes.current.length || !editor.current) return;
    const index =
      (summary.current - 1 + direction + changes.current.length) % changes.current.length;
    editor.current
      .getModifiedEditor()
      .revealLineInCenter(Math.max(1, changes.current[index].modifiedStartLineNumber));
    setSummary((value) => ({ ...value, current: index + 1 }));
  };
  useEffect(() => {
    const originalModel = monaco.editor.createModel(original, language);
    const modifiedModel = monaco.editor.createModel(modified, language);
    const instance = monaco.editor.createDiffEditor(host.current!, {
      ...options,
      readOnly: true,
      renderSideBySide: false,
      originalEditable: false,
      ignoreTrimWhitespace: false,
      renderIndicators: true,
    });
    editor.current = instance;
    setSummary({ count: 0, added: 0, removed: 0, current: 0, ready: false });
    let revealed = false;
    const updated = instance.onDidUpdateDiff(() => {
      const diff = instance.getLineChanges();
      if (!diff) return;
      changes.current = diff;
      setSummary((previous) => ({
        count: diff.length,
        added: diff.reduce(
          (sum, change) =>
            sum +
            (change.modifiedEndLineNumber
              ? change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1
              : 0),
          0,
        ),
        removed: diff.reduce(
          (sum, change) =>
            sum +
            (change.originalEndLineNumber
              ? change.originalEndLineNumber - change.originalStartLineNumber + 1
              : 0),
          0,
        ),
        current: diff.length ? Math.min(previous.current || 1, diff.length) : 0,
        ready: true,
      }));
      const first = diff[0];
      if (revealed || !first) return;
      revealed = true;
      instance.getModifiedEditor().revealLineInCenter(Math.max(1, first.modifiedStartLineNumber));
    });
    instance.setModel({ original: originalModel, modified: modifiedModel });
    // Detach before disposing models; otherwise Monaco emits a lifecycle error.
    return () => {
      updated.dispose();
      editor.current = null;
      changes.current = [];
      instance.setModel(null);
      instance.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [original, modified, language]);
  return (
    <div className="diff-surface" data-testid="code-diff">
      <div className="diff-navigation">
        <span role="status">
          {!summary.ready
            ? 'Comparing versions…'
            : !summary.count
              ? 'No code changes'
              : `Change ${summary.current} of ${summary.count}`}
        </span>
        {summary.count > 0 && (
          <span className="diff-counts">
            <b className="insert-count">+{summary.added}</b>
            <b className="delete-count">−{summary.removed}</b>
            <span>lines</span>
          </span>
        )}
        <button
          aria-label="Previous change"
          disabled={summary.count < 2}
          onClick={() => navigate(-1)}
        >
          ↑
        </button>
        <button aria-label="Next change" disabled={summary.count < 2} onClick={() => navigate(1)}>
          ↓
        </button>
      </div>
      <div ref={host} className="diff-editor-host" />
    </div>
  );
}
