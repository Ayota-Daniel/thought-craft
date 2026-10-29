import { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Entity } from '../../domain/entity';

export interface EntityNodeData extends Record<string, unknown> {
  entity: Entity;
  typeLabel: string;
  icon: string;
  openEntity: (id: string) => void;
}
export type EntityFlowNode = Node<EntityNodeData, 'entity'>;

export function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  const icon = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (icon.current) {
      setIcon(icon.current, data.icon);
    }
  }, [data.icon]);
  return (
    <article className="tc-entity-node" data-entity-id={data.entity.id}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        aria-label={`Connect to ${data.entity.title}`}
      />
      <div className="tc-board-card-type">
        <span ref={icon} aria-hidden="true" />
        {data.typeLabel}
      </div>
      <h3 title={data.entity.title}>{data.entity.title}</h3>
      <button
        type="button"
        className="nodrag nopan tc-board-open"
        onClick={() => data.openEntity(data.entity.id)}
      >
        Open
      </button>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        aria-label={`Connect from ${data.entity.title}`}
      />
    </article>
  );
}
