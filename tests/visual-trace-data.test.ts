import { expect, it } from 'vitest';
import { answerAsNotes, parseVisualTrace } from '../src/shared/visual-trace';
import { VISUAL_TRACE_GUIDANCE } from '../src/shared/visual-trace-guidance';
import { dpTrace, treeTrace, traceFence } from './fixtures/visual-traces';

it('accepts tree returns, duplicate values with distinct IDs, and DP states', () => {
  expect(parseVisualTrace(JSON.stringify(treeTrace))?.steps[1].edge).toEqual({
    from: 'left',
    to: 'root',
  });
  const duplicateValues = {
    ...treeTrace,
    nodes: treeTrace.nodes.map((n) => ({ ...n, label: '1' })),
  };
  expect(parseVisualTrace(JSON.stringify(duplicateValues))).not.toBeNull();
  expect(parseVisualTrace(JSON.stringify(dpTrace))?.steps[1].values.at(-1)?.value).toBe('2');
});
it('rejects dangling references, overlapping nodes, invalid bounds and excessive trace sizes', () => {
  for (const trace of [
    { ...treeTrace, nodes: [treeTrace.nodes[0], treeTrace.nodes[0]] },
    { ...treeTrace, nodes: treeTrace.nodes.map((n) => ({ ...n, row: 0, column: 0 })) },
    { ...treeTrace, edges: [{ from: 'root', to: 'missing' }] },
    { ...treeTrace, steps: [{ ...treeTrace.steps[0], active: ['missing'] }] },
    { ...treeTrace, steps: [{ ...treeTrace.steps[0], edge: { from: 'left', to: 'right' } }] },
    { ...treeTrace, nodes: treeTrace.nodes.map((n) => ({ ...n, column: -1 })) },
    { ...treeTrace, nodes: treeTrace.nodes.map((n) => ({ ...n, column: 99999 })) },
    { ...treeTrace, steps: [] },
    { ...treeTrace, steps: Array(33).fill(treeTrace.steps[0]) },
    { ...treeTrace, version: 2 },
  ])
    expect(parseVisualTrace(JSON.stringify(trace))).toBeNull();
  expect(parseVisualTrace(' '.repeat(48001))).toBeNull();
});
it('copies speech and writing notes rather than drawing JSON without modifying code examples', () => {
  const text = answerAsNotes(
    'Approach\n\n' + traceFence(treeTrace) + '\n\nShall I implement that?',
  );
  expect(text).toContain('Say this: I need the deeper side');
  expect(text).toContain('Write / mark:\nleft = depth(node.left)');
  expect(text).toContain('Shall I implement that?');
  expect(text).not.toContain('"nodes"');
  const nested = '````text\n' + traceFence(treeTrace) + '\n````';
  expect(answerAsNotes(nested)).toBe(nested);
});
it('the example actually supplied to the model obeys the rendering contract', () => {
  const start = VISUAL_TRACE_GUIDANCE.indexOf('{\n');
  const end = VISUAL_TRACE_GUIDANCE.indexOf('\n}\n', start) + 2;
  expect(parseVisualTrace(VISUAL_TRACE_GUIDANCE.slice(start, end))?.steps).toHaveLength(4);
});

it('sends readable trace context to answer and speech routing without changing saved output', async () => {
  const { buildHistory, compactSpeechRequest } = await import('../src/shared/history');
  const raw = traceFence(treeTrace);
  const history = buildHistory([{ question: 'Find depth', answer: raw, status: 'done' }]);
  expect(history[1].content).toContain('return 1 + max(1, 1) = 2');
  expect(history[1].content).not.toContain('"nodes"');
  const routing = compactSpeechRequest({
    text: 'Why add one?',
    context: '',
    recentSpeech: [],
    history: [{ role: 'assistant', content: raw }],
    currentResponse: raw,
  });
  expect(routing.currentResponse).toContain('Adding the root');
  expect(routing.currentResponse).not.toContain('"nodes"');
  expect(routing.history[0].content).not.toContain('"nodes"');
});

it('preserves diagram-only values and topology in copied and future conversational context', () => {
  const trace = {
    ...treeTrace,
    steps: [
      {
        title: 'Return',
        say: 'That goes back to the parent.',
        write: 'return result',
        active: ['left'],
        removed: ['right'],
        done: ['left'],
        values: [{ id: 'left', value: 'depth 1' }],
        edge: { from: 'left', to: 'root' },
      },
    ],
  };
  const text = answerAsNotes(traceFence(trace));
  expect(text).toContain('root (3)');
  expect(text).toContain('left (9)');
  expect(text).toContain('row 1, column 0');
  expect(text).toContain('root (3) -> left (9)');
  expect(text).toContain('Values: left (9) = depth 1');
  expect(text).toContain('Removed: right (20)');
  expect(text).toContain('Traversal: left (9) -> root (3)');
});
