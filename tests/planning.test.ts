import { expect, it } from 'vitest';
import { planningCode } from '../src/shared/planning';
import { extractProposal } from '../src/shared/revision';
it('keeps complete planning blocks separate from executable proposals', () => {
  const answer = 'Plan\n```pseudocode\npark(size):\n  find a spot\n```\nExplain why.';
  expect(planningCode(answer)).toBe('park(size):\n  find a spot');
  expect(extractProposal(answer, 0)).toBeNull();
  expect(planningCode('```pseudocode\npartial')).toBe('');
  expect(planningCode('```python\nprint(1)\n```')).toBe('');
});

import { workspacePlans, codingScript } from '../src/shared/planning';
it('retains planning through streaming, explanation and implementation turns', () => {
  const plan = {
    id: 'plan',
    question: 'Show the design',
    answer: '```pseudocode\npark(): find spot\n```',
    status: 'done',
  };
  const followup = { id: 'why', question: 'Why a ticket?', answer: '', status: 'streaming' };
  expect(workspacePlans([plan, followup]).map((p) => p.id)).toEqual(['plan']);
  expect(
    workspacePlans([plan, { ...followup, status: 'done', answer: '```python\npass\n```' }])[0].code,
  ).toContain('find spot');
  expect(
    workspacePlans([plan, { ...followup, question: 'Next problem: design a library' }]),
  ).toEqual([]);
});
it('extracts coding narration without pulling in code or unrelated traces', () => {
  const answer =
    '> I keep a ticket lookup.\n\n## While coding\n\n- **Entry:** I find a free spot first.\n- **Exit:** I check the ticket before freeing it.\n\n```python\npass\n```\n\n## Dry run\nDifferent content';
  expect(codingScript(answer)).toContain('I find a free spot first');
  expect(codingScript(answer)).not.toContain('Different content');
  expect(codingScript(answer)).not.toContain('```');
});

it('builds from entities to method pseudocode without losing the overview', () => {
  const turns = [
    {
      id: 'entities',
      question: 'Design it',
      status: 'done',
      answer: '## Entities\n\n| Class | Job |\n|---|---|\n| Ticket | Finds a spot |',
    },
    {
      id: 'methods',
      question: 'Show methods',
      status: 'done',
      answer: '```pseudocode\nexit(ticketId): free the linked spot\n```',
    },
  ];
  const plans = workspacePlans(turns);
  expect(plans).toHaveLength(2);
  expect(plans[1].overview).toContain('Ticket');
  expect(plans[1].code).toContain('exit(ticketId)');
});
