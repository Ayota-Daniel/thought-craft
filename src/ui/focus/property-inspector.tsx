import type { EntityPropertyWriter } from '../../application/entity-properties';
import type { Entity } from '../../domain/entity';
import { PropertyEditor } from './property-editor';

interface PropertyInspectorProps {
  entity: Entity;
  writer: EntityPropertyWriter;
  addProperty: () => void;
}

export function PropertyInspector({ entity, writer, addProperty }: PropertyInspectorProps) {
  return (
    <div className="tc-inspector-content">
      <h2>Properties</h2>
      {entity.properties.length === 0 && (
        <p className="tc-inspector-hint">Add the details that matter to this idea.</p>
      )}

      {entity.properties.map((property) => (
        <PropertyEditor
          key={property.key}
          property={property}
          update={(expected, value) => writer.updateProperty(entity.id, expected, value)}
          remove={(expected) => writer.removeProperty(entity.id, expected)}
        />
      ))}

      <button className="tc-add-property" onClick={addProperty}>
        + Add property
      </button>

      {entity.propertyIssues.length > 0 && (
        <div className="tc-property-issues" role="status">
          <p>Some property definitions could not be read. They remain in the Markdown note.</p>
          <ul>
            {entity.propertyIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="tc-entity-metadata">
        <summary>Thought Craft metadata</summary>
        <dl>
          <dt>Type</dt>
          <dd>{entity.type}</dd>
          <dt>Status</dt>
          <dd>{entity.status}</dd>
          <dt>Workspace</dt>
          <dd>{entity.workspaceId}</dd>
          <dt>Created</dt>
          <dd>{entity.createdAt}</dd>
          <dt>Updated</dt>
          <dd>{entity.updatedAt}</dd>
          <dt>Entity ID</dt>
          <dd>{entity.id}</dd>
          <dt>Note</dt>
          <dd>{entity.filePath}</dd>
        </dl>
      </details>
    </div>
  );
}
