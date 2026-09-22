import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { buildInstructions } from '../src/shared/prompts';
import { settingsSchema } from '../src/shared/contracts';
import { LLD_GUIDANCE, LLD_TURN_EXAMPLES } from '../src/shared/lld-guidance';
import { extractProposal } from '../src/shared/revision';
import AnswerContent from '../src/renderer/components/AnswerContent';

it('includes LLD turn guidance and one shared visual protocol in mixed sessions', () => {
  const prompt = buildInstructions(settingsSchema.parse({}));
  expect(prompt).toContain(LLD_GUIDANCE);
  expect(prompt).toContain(LLD_TURN_EXAMPLES);
  expect(prompt.match(/Visual dry-run output:/g)).toHaveLength(1);
  expect(prompt).toContain('For DSA and LLD planning');
});

it('renders LLD scope and interfaces as notes without proposing a workspace replacement', () => {
  const text = `> I'll keep this to a single location.

## Requirements
- Deposit and collect packages.

## Out of scope
- Delivery routing.

## Assumptions
- Exact size matching, unless changed.

## Class design
\`\`\`pseudocode
Locker
  deposit(size) -> pickup code or error
  pickup(code) -> success or error
\`\`\``;
  const html = renderToStaticMarkup(createElement(AnswerContent, { text }));
  expect(html).toContain('Say this');
  expect(html).toContain('Write / draw');
  expect(html).toContain('Pseudocode · planning only');
  expect(html).toContain('Exact size matching');
  expect(extractProposal(text, 4)).toBeNull();
});
