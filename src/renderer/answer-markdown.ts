interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MarkdownNode[];
}

const textOf = (node: MarkdownNode): string =>
  node.value ?? (node.children ?? []).map(textOf).join('');

/** Repair only the known three-column dry-run header corruption, never source text. */
export function repairDryRunHeader() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === 'table') {
        const cells = node.children?.[0]?.children;
        if (
          cells?.length === 3 &&
          textOf(cells[0]).replace(/\s/g, '').toLowerCase() === 'stepwrite/statesayaloud' &&
          cells.slice(1).every((cell) => !textOf(cell).trim())
        ) {
          ['Step', 'Write / state', 'Say aloud'].forEach((value, index) => {
            cells[index].children = [{ type: 'text', value }];
          });
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/** Recover the known late-heading layout without rewriting the candidate's words. */
export function organizeResponseSections() {
  return (tree: MarkdownNode) => {
    const nodes = tree.children ?? [];
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      const previous = nodes[i - 1];
      if (node.type !== 'heading' || previous.type !== 'blockquote') continue;
      const title = textOf(node).trim().toLowerCase();
      const speech = textOf(previous);
      const matches =
        title === 'brute force'
          ? /brute.force|repeated.scan|straightforward approach/i.test(speech)
          : title === 'better approach' &&
            /better (?:way|approach)|avoid (?:that|this)/i.test(speech);
      // Do not move an existing section's speech into the next section.
      if (matches && nodes[i - 2]?.type !== 'heading') {
        nodes[i - 1] = node;
        nodes[i] = previous;
      }
    }
    let heading = '';
    tree.children = nodes.flatMap((node) => {
      if (node.type === 'heading') heading = textOf(node).trim().toLowerCase();
      const labels = node.type === 'table' ? node.children?.[0]?.children?.map(textOf) : undefined;
      if (labels?.join('|') === 'Step|Write / state|Say aloud' && heading !== 'dry run') {
        heading = 'dry run';
        return [
          { type: 'heading', depth: 2, children: [{ type: 'text', value: 'Dry run' }] },
          node,
        ];
      }
      return [node];
    });
  };
}
