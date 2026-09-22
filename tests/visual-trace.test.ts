import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import AnswerContent from '../src/renderer/components/AnswerContent';
import { splitAnswer } from '../src/shared/revision';
import { treeTrace, traceFence } from './fixtures/visual-traces';

it('renders a model trace as copyable notes instead of raw JSON', () => {
  const html = renderToStaticMarkup(createElement(AnswerContent, { text: traceFence(treeTrace) }));
  expect(html).toContain('aria-label="Visual dry run: Maximum tree depth"');
  expect(html).toContain('Copy notes for step 4');
  expect(html).toContain('Walkthrough');
  expect(html).toContain('I need the deeper side');
  expect(html).not.toContain('&quot;version&quot;');
});
it('keeps diagrams display-only beside an authorized implementation', () => {
  const trace = traceFence(treeTrace);
  expect(splitAnswer(trace, 4)).toEqual({ spoken: trace, proposal: null });
  const result = splitAnswer('```python\nreturn 2\n```\n' + trace, 4);
  expect(result.proposal).toEqual({ code: 'return 2', language: 'python', baseVersion: 4 });
  expect(result.spoken).toContain(trace);
});

it('does not expose partial drawing JSON while an answer streams', () => {
  const html = renderToStaticMarkup(
    createElement(AnswerContent, {
      text: '```dry-run\n{"version":1,"steps":[',
      streaming: true,
    }),
  );
  expect(html).toContain('Preparing the visual walkthrough');
  expect(html).not.toContain('&quot;version&quot;');
});
it('keeps malformed drawings local and preserves the rest of the answer', () => {
  const html = renderToStaticMarkup(
    createElement(AnswerContent, {
      text: '> The left side returns one.\n\n```dry-run\n{}\n```\n\nThat makes the answer two.',
    }),
  );
  expect(html).toContain('could not be drawn');
  expect(html).toContain('The left side returns one.');
  expect(html).toContain('That makes the answer two.');
});
