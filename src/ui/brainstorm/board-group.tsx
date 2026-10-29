import type { Node, NodeProps } from '@xyflow/react';

export type GroupFlowNode = Node<{ label: string; memberIds: readonly string[] }, 'boardGroup'>;

export function BoardGroupNode({ data }: NodeProps<GroupFlowNode>) {
  return (
    <section className="tc-board-group">
      <div
        className="tc-board-group-title"
        title="Drag this title to move the group and its members"
      >
        {data.label}
      </div>
    </section>
  );
}
