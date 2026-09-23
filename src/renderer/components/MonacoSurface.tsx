import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';

type CodeFocus = { line: number; request: number };
function highlight(editor: monaco.editor.IStandaloneCodeEditor | null, focus?: CodeFocus) {
  if (!editor || !focus) return;
  const decorations = editor.createDecorationsCollection([
    {
      range: new monaco.Range(focus.line, 1, focus.line, 1),
      options: { isWholeLine: true, className: 'coding-active-line' },
    },
  ]);
  editor.revealLineInCenterIfOutsideViewport(focus.line);
  return () => decorations.clear();
}

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
  focus,
}: {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  focus?: CodeFocus;
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
  useEffect(() => highlight(editor.current, focus), [focus]);
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
  originalLabel = 'Before',
  modifiedLabel = 'After',
  focus,
}: {
  original: string;
  modified: string;
  language: string;
  originalLabel?: string;
  modifiedLabel?: string;
  focus?: CodeFocus;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const changes = useRef<monaco.editor.ILineChange[]>([]);
  const [sideBySide, setSideBySide] = useState(false);
  const [summary, setSummary] = useState({
    count: 0,
    added: 0,
    removed: 0,
    current: 0,
    ready: false,
  });
  const jump = (index: number) => {
    if (!changes.current.length || !editor.current) return;
    if (index < 0 || index >= changes.current.length) return;
    editor.current
      .getOriginalEditor()
      .revealLineInCenter(Math.max(1, changes.current[index].originalStartLineNumber));
    editor.current
      .getModifiedEditor()
      .revealLineInCenter(Math.max(1, changes.current[index].modifiedStartLineNumber));
    setSummary((value) => ({ ...value, current: index + 1 }));
  };
  const navigate = (direction: number) =>
    jump((summary.current - 1 + direction + changes.current.length) % changes.current.length);
  useEffect(() => {
    const originalModel = monaco.editor.createModel(original, language);
    const modifiedModel = monaco.editor.createModel(modified, language);
    const instance = monaco.editor.createDiffEditor(host.current!, {
      ...options,
      readOnly: true,
      renderSideBySide: sideBySide,
      useInlineViewWhenSpaceIsLimited: false,
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
  useEffect(() => {
    editor.current?.updateOptions({ renderSideBySide: sideBySide });
  }, [sideBySide]);
  useEffect(
    () => highlight(editor.current?.getModifiedEditor() ?? null, focus),
    [focus, original, modified],
  );
  const selected = changes.current[summary.current - 1];
  const snippet = (text: string, start: number, end: number) =>
    end === 0 ? [] : text.split(/\r?\n/).slice(start - 1, end);
  const before = selected
    ? snippet(original, selected.originalStartLineNumber, selected.originalEndLineNumber)
    : [];
  const after = selected
    ? snippet(modified, selected.modifiedStartLineNumber, selected.modifiedEndLineNumber)
    : [];
  return (
    <div className="diff-surface" data-testid="code-diff">
      <div className="diff-comparison-labels">
        <span>{originalLabel}</span>
        <span aria-hidden="true">→</span>
        <span>{modifiedLabel}</span>
      </div>
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
        <label className="diff-layout">
          <input
            type="checkbox"
            checked={sideBySide}
            onChange={(event) => setSideBySide(event.target.checked)}
          />
          Side by side
        </label>
      </div>
      {!!summary.count && selected && (
        <details className="change-focus" open>
          <summary>
            Focused change ·{' '}
            {before.length && after.length ? 'Replace' : after.length ? 'Add' : 'Remove'}{' '}
            {Math.max(before.length, after.length)}{' '}
            {Math.max(before.length, after.length) === 1 ? 'line' : 'lines'}
          </summary>
          <label className="change-picker">
            Jump to change
            <select
              aria-label="Jump to change"
              value={summary.current - 1}
              onChange={(event) => jump(Number(event.target.value))}
            >
              {changes.current.map((change, index) => (
                <option key={index} value={index}>
                  Change {index + 1} ·{' '}
                  {change.modifiedEndLineNumber
                    ? `new line ${change.modifiedStartLineNumber}`
                    : `removed at old line ${change.originalStartLineNumber}`}
                </option>
              ))}
            </select>
          </label>
          <div className="change-pair">
            <section aria-label="Before this change" className="change-before">
              <h4>Before · {originalLabel}</h4>
              {before.length ? (
                <pre>
                  {before.map((line, i) => (
                    <span className="change-line" key={i}>
                      <span aria-hidden="true">− {selected.originalStartLineNumber + i}</span>
                      <code>{line || ' '}</code>
                    </span>
                  ))}
                </pre>
              ) : (
                <p>No lines replaced; this is an addition.</p>
              )}
            </section>
            <section aria-label="After this change" className="change-after">
              <h4>After · {modifiedLabel}</h4>
              {after.length ? (
                <pre>
                  {after.map((line, i) => (
                    <span className="change-line" key={i}>
                      <span aria-hidden="true">+ {selected.modifiedStartLineNumber + i}</span>
                      <code>{line || ' '}</code>
                    </span>
                  ))}
                </pre>
              ) : (
                <p>These lines were removed.</p>
              )}
            </section>
          </div>
        </details>
      )}
      <div ref={host} className="diff-editor-host" />
    </div>
  );
}
