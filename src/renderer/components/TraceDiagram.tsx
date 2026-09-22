import { useEffect, useId, useRef, useState } from 'react';
import type { TraceStep, VisualTrace } from '../../shared/visual-trace';

function nodeState(id: string, step: TraceStep) {
  return `${step.done.includes(id) ? 'done' : ''} ${step.removed.includes(id) ? 'removed' : ''} ${step.active.includes(id) ? 'active' : ''}`;
}

export default function TraceDiagram({ trace, step }: { trace: VisualTrace; step: TraceStep }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const markerId = useId().replace(/:/g, '');
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const columns = Math.max(1, ...trace.nodes.map((node) => node.column + 1));
  const rows = Math.max(1, ...trace.nodes.map((node) => node.row + 1));
  const values = new Map(step.values.map((value) => [value.id, value.value]));
  const graph = trace.kind === 'tree' || trace.kind === 'graph';
  const diagramWidth = Math.max(width, columns * 86);
  const point = (id: string) => {
    const node = trace.nodes.find((n) => n.id === id)!;
    return { x: ((node.column + 0.5) * diagramWidth) / columns, y: node.row * 106 + 50 };
  };
  const arrow = (from: string, to: string, highlighted: boolean, directed = false) => {
    const a = point(from),
      b = point(to);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (!distance)
      return (
        <path
          key={`${from}:${to}:${highlighted}`}
          className={highlighted ? 'trace-edge active' : 'trace-edge'}
          d={`M${a.x + 16},${a.y - 15} C${a.x + 50},${a.y - 55} ${a.x - 50},${a.y - 55} ${a.x - 16},${a.y - 15}`}
          markerEnd={directed || highlighted ? `url(#${markerId})` : undefined}
        />
      );
    const ux = (b.x - a.x) / distance,
      uy = (b.y - a.y) / distance;
    return (
      <path
        key={`${from}:${to}:${highlighted}`}
        className={highlighted ? 'trace-edge active' : 'trace-edge'}
        d={`M${a.x + ux * 25},${a.y + uy * 25} L${b.x - ux * 28},${b.y - uy * 28}`}
        markerEnd={directed || highlighted ? `url(#${markerId})` : undefined}
      />
    );
  };
  return (
    <div
      className="trace-diagram-scroll"
      ref={container}
      role="region"
      aria-label={`${trace.kind} diagram`}
      tabIndex={0}
    >
      {graph ? (
        <svg
          className="trace-graph"
          width={diagramWidth}
          height={rows * 106}
          viewBox={`0 0 ${diagramWidth} ${rows * 106}`}
          role="img"
          aria-label={`${trace.title}: ${step.title}`}
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          {trace.edges.map((edge) => arrow(edge.from, edge.to, false, edge.directed))}
          {step.edge && arrow(step.edge.from, step.edge.to, true)}
          {trace.nodes.map((node) => {
            const { x, y } = point(node.id);
            const value = values.get(node.id);
            return (
              <g
                key={node.id}
                className={`trace-node ${nodeState(node.id, step)}`}
                aria-label={`${node.label}${value ? `: ${value}` : ''}`}
              >
                <title>
                  {node.label}
                  {value ? `: ${value}` : ''}
                </title>
                <circle cx={x} cy={y} r={23} />
                {step.done.includes(node.id) && (
                  <text className="trace-check" x={x + 18} y={y - 19}>
                    ✓
                  </text>
                )}
                <text x={x} y={y + 5} textAnchor="middle">
                  {node.label.length > 5 ? node.label.slice(0, 4) + '…' : node.label}
                </text>
                {value !== undefined && (
                  <text className="trace-node-value" x={x} y={y + 44} textAnchor="middle">
                    {value.length > 12 ? value.slice(0, 11) + '…' : value}
                  </text>
                )}
                {step.removed.includes(node.id) && (
                  <path className="trace-cross" d={`M${x - 16} ${y + 16} L${x + 16} ${y - 16}`} />
                )}
              </g>
            );
          })}
        </svg>
      ) : (
        <div
          className="trace-cells"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(72px, 1fr))` }}
        >
          {trace.nodes.map((node) => (
            <div
              key={node.id}
              className={`trace-cell ${nodeState(node.id, step)}`}
              style={{ gridRow: node.row + 1, gridColumn: node.column + 1 }}
            >
              <span className="trace-cell-label">{node.label}</span>
              {values.has(node.id) && <strong>{values.get(node.id)}</strong>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
