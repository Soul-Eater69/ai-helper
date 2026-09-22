export const treeTrace = {
  version: 1,
  kind: 'tree',
  title: 'Maximum tree depth',
  input: '[3, 9, 20]',
  nodes: [
    { id: 'root', label: '3', row: 0, column: 1 },
    { id: 'left', label: '9', row: 1, column: 0 },
    { id: 'right', label: '20', row: 1, column: 2 },
  ],
  edges: [
    { from: 'root', to: 'left' },
    { from: 'root', to: 'right' },
  ],
  steps: [
    {
      title: 'Start at 3',
      say: 'I need the deeper side, then add one for this node.',
      write: 'left = depth(node.left)',
      active: ['root'],
      collections: [{ label: 'Call stack · top first', items: ['depth(3)'] }],
    },
    {
      title: '9 returns one',
      say: 'Both children of 9 are empty, so each returns zero. Including 9 gives a depth of one.',
      write: '1 + max(0, 0) = 1',
      active: ['left'],
      done: ['left'],
      values: [{ id: 'left', value: 'depth 1' }],
      edge: { from: 'left', to: 'root' },
      collections: [{ label: 'Call stack · top first', items: ['depth(9) → 1', 'depth(3) waits'] }],
    },
    {
      title: '20 returns one',
      say: 'The right side is also a leaf, so it returns one too.',
      write: 'right = 1',
      active: ['right'],
      done: ['left', 'right'],
      values: [
        { id: 'left', value: 'depth 1' },
        { id: 'right', value: 'depth 1' },
      ],
      edge: { from: 'right', to: 'root' },
    },
    {
      title: 'Return two',
      say: 'Both sides have depth one. Adding the root makes the answer two.',
      write: 'return 1 + max(1, 1) = 2',
      active: ['root'],
      done: ['root', 'left', 'right'],
      values: [
        { id: 'root', value: 'depth 2' },
        { id: 'left', value: 'depth 1' },
        { id: 'right', value: 'depth 1' },
      ],
    },
  ],
};
export const dpTrace = {
  version: 1,
  kind: 'dp',
  title: 'Climbing stairs',
  input: 'n = 3',
  nodes: [0, 1, 2, 3].map((column) => ({
    id: `d${column}`,
    label: `dp[${column}]`,
    row: 0,
    column,
  })),
  edges: [],
  steps: [
    {
      title: 'Base cases',
      say: 'There is one way to stay at zero and one way to reach step one.',
      write: 'dp[0] = dp[1] = 1',
      done: ['d0', 'd1'],
      values: [
        { id: 'd0', value: '1' },
        { id: 'd1', value: '1' },
      ],
    },
    {
      title: 'Fill step two',
      say: 'I can come from step one or step zero. Those give two ways in total.',
      write: 'dp[2] = dp[1] + dp[0] = 2',
      active: ['d2'],
      done: ['d0', 'd1'],
      values: [
        { id: 'd0', value: '1' },
        { id: 'd1', value: '1' },
        { id: 'd2', value: '2' },
      ],
    },
  ],
};
export function traceFence(trace: unknown): string {
  return '```dry-run\n' + JSON.stringify(trace) + '\n```';
}
