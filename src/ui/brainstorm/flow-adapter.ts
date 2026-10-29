import type { BoardGroup } from '../../domain/board-group';
import type { BoardSelection } from './brainstorm-toolbar';
import { MarkerType, type Edge } from '@xyflow/react';
import { ENTITY_TYPES } from '../../domain/entity-type';
import type { BoardEntity, BoardRelationship } from '../../application/board-projection';
import type { BoardServices } from './board-services';
import type { EntityFlowNode } from './entity-node';

export function entityNodes(
  entities: readonly BoardEntity[],
  services: BoardServices,
  openEntity: (id: string) => void,
): EntityFlowNode[] {
  return entities.map(({ entity, position }) => ({
    id: entity.id,
    type: 'entity',
    position,
    data: {
      entity,
      typeLabel: services.types.label(entity.type),
      icon: ENTITY_TYPES[entity.type]?.icon ?? 'file-text',
      openEntity,
    },
    ariaLabel: `${services.types.label(entity.type)}: ${entity.title}`,
    width: 220,
    deletable: false,
  }));
}

export function relationEdges(
  relationships: readonly BoardRelationship[],
  services: BoardServices,
): Edge[] {
  return relationships.map(({ source, target, relation }) => {
    const parallel = relationships.filter(
      (edge) => edge.source.id === source.id && edge.target.id === target.id,
    );
    const labelOffset =
      (parallel.findIndex((edge) => edge.relation.id === relation.id) - (parallel.length - 1) / 2) *
      22;
    const label = services.relations.label(source.workspaceId, relation.type);
    const issue = services.relations.compatibilityIssue(source, target, relation.type);
    return {
      id: `${source.id}:${relation.id}`,
      source: source.id,
      target: target.id,
      sourceHandle: 'out',
      targetHandle: 'in',
      label,
      type: 'relation',
      data: { labelOffset },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      ariaLabel: `${source.title} → ${label} → ${target.title}${issue ? `. ${issue}` : ''}`,
      className: issue ? 'tc-board-edge-incompatible' : undefined,
      deletable: false,
      labelStyle: { fill: 'var(--text-muted)', fontSize: 11 },
      labelBgStyle: { fill: 'var(--background-primary)' },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 3,
    };
  });
}

/** Selection controls must never operate on a card or edge hidden by Focus. */
export function selectionIsVisible(
  selection: BoardSelection | null,
  visible: ReadonlySet<string> | null,
  groups: readonly BoardGroup[],
  edges: readonly Edge[],
): boolean {
  if (!selection) return false;
  if (!visible) return true;
  if (selection.kind === 'node') return visible.has(selection.id);
  if (selection.kind === 'group') {
    return Boolean(
      groups.find((group) => group.id === selection.id)?.entityIds.some((id) => visible.has(id)),
    );
  }
  const edge = edges.find((edge) => edge.id === selection.id);
  return Boolean(edge && visible.has(edge.source) && visible.has(edge.target));
}
