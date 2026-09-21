import { useEffect, useRef } from 'react';
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
/** One contiguous run of changed lines, numbered against the proposed document. */
export interface DiffRegion {
  start: number;
  end: number;
  added: number;
  removed: number;
}

export interface DiffSummary {
  regions: DiffRegion[];
  added: number;
  removed: number;
}

export function CodeDiff({
  original,
  modified,
  language,
  onSummary,
  focusIndex,
}: {
  original: string;
  modified: string;
  language: string;
  /** Reports what actually changed, so the panel can say so in words. */
  onSummary?: (summary: DiffSummary) => void;
  /** Index into the reported regions to scroll to; changing it jumps there. */
  focusIndex?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const regions = useRef<DiffRegion[]>([]);
  const report = useRef(onSummary);
  report.current = onSummary;

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
    editor.current = instance;

    // The diff is computed asynchronously, so the summary has to wait for this event
    // rather than being read straight after setModel.
    const subscription = instance.onDidUpdateDiff(() => {
      const changes = instance.getLineChanges() ?? [];
      const mapped: DiffRegion[] = changes.map((change) => {
        const removed =
          change.originalEndLineNumber === 0
            ? 0
            : change.originalEndLineNumber - change.originalStartLineNumber + 1;
        const added =
          change.modifiedEndLineNumber === 0
            ? 0
            : change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
        // A pure deletion reports modifiedEndLineNumber 0; anchor it to the line the
        // removed text used to follow, so the jump still lands somewhere sensible.
        const start = change.modifiedStartLineNumber || 1;
        return { start, end: change.modifiedEndLineNumber || start, added, removed };
      });
      regions.current = mapped;
      report.current?.({
        regions: mapped,
        added: mapped.reduce((n, r) => n + r.added, 0),
        removed: mapped.reduce((n, r) => n + r.removed, 0),
      });
      // Land on the first change instead of the top of the file.
      if (mapped.length) instance.getModifiedEditor().revealLineInCenter(mapped[0].start);
    });

    return () => {
      subscription.dispose();
      // Detach before disposing models; otherwise Monaco emits a lifecycle error.
      instance.setModel(null);
      instance.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editor.current = null;
      regions.current = [];
    };
  }, [original, modified, language]);

  useEffect(() => {
    if (focusIndex === undefined) return;
    const region = regions.current[focusIndex];
    if (region && editor.current)
      editor.current.getModifiedEditor().revealLineInCenter(region.start);
  }, [focusIndex]);

  return <div ref={host} className="monaco-surface" data-testid="code-diff" />;
}
