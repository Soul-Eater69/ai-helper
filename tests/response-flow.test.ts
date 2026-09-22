import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import AnswerContent from '../src/renderer/components/AnswerContent';

it('separates missing personal facts from words spoken to the interviewer', () => {
  const html = renderToStaticMarkup(
    createElement(AnswerContent, {
      text: '> [Context needed]\n> Add a real GenAI project and how you checked its output.',
    }),
  );
  expect(html).toContain('Personal context needed');
  expect(html).not.toContain('Say this');
  expect(html).not.toContain('[Context needed]');
});
it('distinguishes explaining, writing and checking without changing the answer', () => {
  const html = renderToStaticMarkup(
    createElement(AnswerContent, {
      text: '## Brute force\n\n> I check each pair.\n\n## Algorithm\n\n```pseudocode\nFOR each pair\n    CHECK sum\n```\n\n## Dry run\n\nCheck two different indices.',
    }),
  );
  expect(html).toContain('Explain');
  expect(html).toContain('Write');
  expect(html).toContain('Walk through');
  expect(html).toContain('I check each pair.');
  expect(html).toContain('CHECK sum');
});

it('does not label an incomplete streamed context marker as spoken guidance', () => {
  const html = renderToStaticMarkup(createElement(AnswerContent, { text: '> [Context nee' }));
  expect(html).toContain('Personal context needed');
  expect(html).not.toContain('Say this');
});
