import { isRecord } from '../shared/record';
import {
  isRelationType,
  validateNewRelation,
  validateRelation,
  type EntityRelation,
} from '../domain/entity-relation';

interface ParsedRelations {
  relations: readonly EntityRelation[];
  issues: readonly string[];
}

export function relationFromDefinition(value: unknown): EntityRelation | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.target_entity_id !== 'string'
  ) {
    return null;
  }
  if (!isRelationType(value.type) || typeof value.created_at !== 'string') {
    return null;
  }

  const relation: EntityRelation = {
    id: value.id.toLowerCase(),
    type: value.type,
    targetEntityId: value.target_entity_id.toLowerCase(),
    createdAt: value.created_at,
  };

  try {
    validateRelation(relation);
    return Object.freeze(relation);
  } catch {
    return null;
  }
}

export function parseRelations(value: unknown, sourceEntityId: string): ParsedRelations {
  if (value === undefined) {
    return { relations: Object.freeze([]), issues: Object.freeze([]) };
  }
  if (!Array.isArray(value)) {
    return {
      relations: Object.freeze([]),
      issues: Object.freeze(['bs_relations must be a list. Open the Markdown note to inspect it.']),
    };
  }

  const relations: EntityRelation[] = [];
  const issues: string[] = [];
  const usedIds = new Set<string>();

  for (const [position, definition] of value.entries()) {
    const relation = relationFromDefinition(definition);

    try {
      if (!relation || usedIds.has(relation.id)) {
        throw new Error('Invalid or duplicated relation ID.');
      }
      validateNewRelation(sourceEntityId, relation, relations);
      usedIds.add(relation.id);
      relations.push(relation);
    } catch {
      issues.push(`Relation ${position + 1} has an invalid, unsupported or duplicated definition.`);
    }
  }

  return { relations: Object.freeze(relations), issues: Object.freeze(issues) };
}

export function serializeRelation(relation: EntityRelation): Record<string, unknown> {
  validateRelation(relation);
  return {
    id: relation.id,
    type: relation.type,
    target_entity_id: relation.targetEntityId,
    created_at: relation.createdAt,
  };
}

function relationList(frontmatter: Record<string, unknown>): unknown[] {
  if (frontmatter.bs_relations === undefined) {
    return [];
  }
  if (!Array.isArray(frontmatter.bs_relations)) {
    throw new Error(
      'bs_relations is not a list. Repair it in the Markdown note before editing relations.',
    );
  }
  return frontmatter.bs_relations;
}

export function addEntityRelation(
  frontmatter: Record<string, unknown>,
  sourceEntityId: string,
  relation: EntityRelation,
): void {
  validateRelation(relation);
  const entries = relationList(frontmatter);
  const existing = parseRelations(entries, sourceEntityId).relations;
  validateNewRelation(sourceEntityId, relation, existing);

  const hasSameId = entries.some(
    (entry) =>
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      entry.id.toLowerCase() === relation.id.toLowerCase(),
  );
  if (hasSameId) {
    throw new Error('This relation ID is already present in the note.');
  }

  frontmatter.bs_relations = [...entries, serializeRelation(relation)];
}

export function removeEntityRelation(
  frontmatter: Record<string, unknown>,
  expected: EntityRelation,
): void {
  const entries = relationList(frontmatter);
  const matches = entries.filter(
    (entry) =>
      isRecord(entry) && typeof entry.id === 'string' && entry.id.toLowerCase() === expected.id,
  );

  if (matches.length !== 1) {
    throw new Error('This relation is missing or its ID is duplicated. Review the Markdown note.');
  }

  const current = relationFromDefinition(matches[0]);
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error(
      'This relation changed elsewhere. Review its current definition before removing it.',
    );
  }

  frontmatter.bs_relations = entries.filter((entry) => entry !== matches[0]);
}
