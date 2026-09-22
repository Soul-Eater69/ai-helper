interface MarkdownNode {
  type: string;
  value?: string;
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
