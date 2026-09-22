import { parseRequirements, requirementsAsNotes } from './requirements';
import { z } from 'zod';

const id = z.string().min(1).max(40);
const shortText = z.string().max(100);
const edgeSchema = z.object({ from: id, to: id, directed: z.boolean().optional() });
const nodeSchema = z.object({
  id,
  label: z.string().max(40),
  row: z.number().int().min(0).max(11),
  column: z.number().int().min(0).max(11),
});
const ids = z.array(id).max(48).default([]);
const stepSchema = z.object({
  title: shortText,
  say: z.string().min(1).max(1400),
  write: z.string().min(1).max(1400),
  active: ids,
  done: ids,
  removed: ids,
  values: z
    .array(z.object({ id, value: z.string().max(60) }))
    .max(48)
    .default([]),
  edge: edgeSchema.optional(),
  collections: z
    .array(
      z.object({
        label: shortText,
        items: z.array(z.string().max(100)).max(32),
      }),
    )
    .max(4)
    .default([]),
});

/** Bounded, declarative data only. Never render model HTML or execute drawing code. */
export const visualTraceSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(['tree', 'graph', 'array', 'grid', 'dp', 'notes']),
    title: shortText,
    input: z.string().max(1600),
    nodes: z.array(nodeSchema).max(48),
    edges: z.array(edgeSchema).max(96).default([]),
    steps: z.array(stepSchema).min(1).max(32),
  })
  .superRefine((trace, ctx) => {
    const known = new Set(trace.nodes.map((node) => node.id));
    const positions = new Set(trace.nodes.map((node) => `${node.row}:${node.column}`));
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (known.size !== trace.nodes.length || positions.size !== trace.nodes.length)
      fail('Node IDs and positions must be unique.');
    if (trace.kind !== 'notes' && !trace.nodes.length) fail('A diagram needs nodes.');
    if (
      new Set(trace.edges.map((edge) => JSON.stringify([edge.from, edge.to]))).size !==
      trace.edges.length
    )
      fail('Duplicate edges are not supported.');
    for (const edge of trace.edges)
      if (!known.has(edge.from) || !known.has(edge.to)) fail('Unknown edge endpoint.');
    for (const step of trace.steps) {
      for (const ref of [
        ...step.active,
        ...step.done,
        ...step.removed,
        ...step.values.map((v) => v.id),
      ])
        if (!known.has(ref)) fail('Unknown step node.');
      if (new Set(step.values.map((value) => value.id)).size !== step.values.length)
        fail('A node has more than one value in a step.');
      if (
        step.edge &&
        !trace.edges.some(
          (edge) =>
            (edge.from === step.edge!.from && edge.to === step.edge!.to) ||
            (edge.from === step.edge!.to && edge.to === step.edge!.from),
        )
      )
        fail('A highlighted traversal must follow an existing edge.');
    }
  });
export type VisualTrace = z.infer<typeof visualTraceSchema>;
export type TraceStep = VisualTrace['steps'][number];

export function parseVisualTrace(text: string): VisualTrace | null {
  if (text.length > 48000) return null;
  try {
    const parsed = visualTraceSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function describeNode(trace: VisualTrace, id: string): string {
  const node = trace.nodes.find((node) => node.id === id);
  return node ? `${id} (${node.label})` : id;
}

export function traceStateAsNotes(trace: VisualTrace, step: TraceStep): string {
  const name = (id: string) => describeNode(trace, id);
  return [
    step.active.length ? `Current / used: ${step.active.map(name).join(', ')}` : '',
    step.done.length ? `Done: ${step.done.map(name).join(', ')}` : '',
    step.removed.length ? `Removed: ${step.removed.map(name).join(', ')}` : '',
    step.values.length
      ? `Values: ${step.values.map((v) => `${name(v.id)} = ${v.value}`).join('; ')}`
      : '',
    step.edge ? `Traversal: ${name(step.edge.from)} -> ${name(step.edge.to)}` : '',
    ...step.collections.map((c) => `${c.label}: ${c.items.join(', ') || '(empty)'}`),
  ]
    .filter(Boolean)
    .join('\n');
}

export function traceAsNotes(trace: VisualTrace): string {
  const layout = trace.nodes
    .map((node) => `${describeNode(trace, node.id)} at row ${node.row}, column ${node.column}`)
    .join('; ');
  const edges = trace.edges
    .map(
      (edge) =>
        `${describeNode(trace, edge.from)} -> ${describeNode(trace, edge.to)}${edge.directed ? ' (directed)' : ' (connection)'}`,
    )
    .join('; ');
  const steps = trace.steps
    .map(
      (step, i) =>
        `${i + 1}. ${step.title}\nSay this: ${step.say}\nWrite / mark:\n${step.write}\n${traceStateAsNotes(trace, step)}`,
    )
    .join('\n\n');
  return `${trace.title}\nInput: ${trace.input}${layout ? `\nLayout: ${layout}` : ''}${edges ? `\nEdges: ${edges}` : ''}\n\n${steps}`;
}

/** Copy readable notes, while leaving other fences (including literal examples) intact. */
export function answerAsNotes(answer: string): string {
  const fences = [...answer.matchAll(/^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)\r?$/gm)];
  let open: { fence: string; tag: string; start: number; body: number } | undefined;
  const replacements: { start: number; end: number; text: string }[] = [];
  for (const match of fences) {
    const tag = match[2].trim();
    if (!open) {
      open = {
        fence: match[1],
        tag,
        start: match.index!,
        body: match.index! + match[0].length + 1,
      };
    } else if (!tag && match[1][0] === open.fence[0] && match[1].length >= open.fence.length) {
      if (open.tag === 'requirements') {
        const board = parseRequirements(answer.slice(open.body, match.index));
        replacements.push({
          start: open.start,
          end: match.index! + match[0].length,
          text: board ? requirementsAsNotes(board) : '',
        });
      }
      if (open.tag === 'dry-run') {
        const trace = parseVisualTrace(answer.slice(open.body, match.index));
        if (trace)
          replacements.push({
            start: open.start,
            end: match.index! + match[0].length,
            text: traceAsNotes(trace),
          });
      }
      open = undefined;
    }
  }
  for (const replacement of replacements.reverse())
    answer = answer.slice(0, replacement.start) + replacement.text + answer.slice(replacement.end);
  return answer;
}
