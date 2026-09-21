/** Keep the opening question and newest complete turns inside a bounded provider payload. */
export function buildHistory(
  turns: readonly { question: string; answer: string; status: string }[],
) {
  type Message = { role: 'user' | 'assistant'; content: string };
  if (!turns.length) return [] as Message[];
  const opening: Message = { role: 'user', content: turns[0].question.slice(0, 20000) };
  const recent: Message[] = [];
  let remaining = 80000 - opening.content.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const group: Message[] = i ? [{ role: 'user', content: turn.question.slice(0, 20000) }] : [];
    if (turn.status === 'done')
      group.push({ role: 'assistant', content: turn.answer.slice(0, 20000) });
    const size = group.reduce((n, m) => n + m.content.length, 0);
    if (size > remaining || recent.length + group.length > 59) break;
    recent.unshift(...group);
    remaining -= size;
  }
  return [opening, ...recent];
}
