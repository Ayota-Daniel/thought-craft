import { useState } from 'react';
import type { Entity } from '../../domain/entity';
import { ENTITY_TYPES } from '../../domain/entity-type';
import { RELATION_TYPES } from '../../domain/entity-relation';
import type { EntityRelationWriter } from '../../application/entity-relations';
import type { IncomingRelation, OutgoingRelation } from '../../infrastructure/entity-index';

interface RelationshipsProps {
  entity: Entity;
  outgoing: readonly OutgoingRelation[];
  incoming: readonly IncomingRelation[];
  writer: EntityRelationWriter;
  addRelation: () => void;
  openEntity: (entityId: string) => void;
}

function OutgoingRelationRow({
  edge,
  sourceId,
  writer,
  openEntity,
}: {
  edge: OutgoingRelation;
  sourceId: string;
  writer: EntityRelationWriter;
  openEntity: (entityId: string) => void;
}) {
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const title = edge.target?.title ?? 'Unavailable target';

  async function removeRelation(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError('');

    try {
      await writer.removeRelation(sourceId, edge.relation);
    } catch (operationError) {
      setError(
        operationError instanceof Error ? operationError.message : 'Could not remove the relation.',
      );
      setPending(false);
    }
  }

  return (
    <li className="tc-relation-row" data-relation-id={edge.relation.id}>
      <div className="tc-relation-heading">
        {edge.target ? (
          <button
            className="tc-entity-link"
            onClick={() => openEntity(edge.relation.targetEntityId)}
          >
            {title}
          </button>
        ) : (
          <span className="tc-missing-target" title={edge.relation.targetEntityId}>
            {title}
          </span>
        )}
        <button
          className="tc-relation-remove"
          aria-label={`Remove relation to ${title}`}
          disabled={pending}
          onClick={() => setConfirmRemoval(true)}
        >
          Remove
        </button>
      </div>
      <span className="tc-relation-type">
        {RELATION_TYPES[edge.relation.type]}
        {edge.target
          ? ` · ${ENTITY_TYPES[edge.target.type].label}`
          : ` · ${edge.relation.targetEntityId.slice(0, 8)}`}
      </span>
      {confirmRemoval && (
        <div
          className="tc-remove-confirmation"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setConfirmRemoval(false);
            }
          }}
        >
          <span>Remove this outgoing relation?</span>
          <button
            disabled={pending}
            onClick={() => {
              void removeRelation();
            }}
          >
            Remove relation
          </button>
          <button onClick={() => setConfirmRemoval(false)}>Cancel</button>
        </div>
      )}
      {error && (
        <div className="tc-error" role="alert">
          {error}
        </div>
      )}
    </li>
  );
}

export function Relationships({
  entity,
  outgoing,
  incoming,
  writer,
  addRelation,
  openEntity,
}: RelationshipsProps) {
  return (
    <section className="tc-relationships" aria-label="Relationships">
      <h2>Relationships</h2>
      <h3>Outgoing</h3>
      {outgoing.length === 0 && <p className="tc-inspector-hint">No outgoing relations.</p>}
      <ul className="tc-relation-list tc-outgoing-relations">
        {outgoing.map((edge) => (
          <OutgoingRelationRow
            key={edge.relation.id}
            edge={edge}
            sourceId={entity.id}
            writer={writer}
            openEntity={openEntity}
          />
        ))}
      </ul>
      <button className="tc-add-property" onClick={addRelation}>
        + Add relation
      </button>
      <h3>Incoming</h3>
      {incoming.length === 0 && <p className="tc-inspector-hint">No incoming relations.</p>}
      <ul className="tc-relation-list tc-incoming-relations">
        {incoming.map(({ relation, source }) => (
          <li key={`${source.id}:${relation.id}`} className="tc-relation-row">
            <button className="tc-entity-link" onClick={() => openEntity(source.id)}>
              {source.title}
            </button>
            <span className="tc-relation-type">
              {RELATION_TYPES[relation.type]} · {ENTITY_TYPES[source.type].label}
            </span>
          </li>
        ))}
      </ul>
      {entity.relationIssues.length > 0 && (
        <div className="tc-property-issues" role="status">
          <p>Some relation definitions could not be read. They remain in the Markdown note.</p>
          <ul>
            {entity.relationIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
