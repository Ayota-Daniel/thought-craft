import type { EntityTypeRegistry } from '../../application/entity-type-registry';
import type { EntitySchemaValueWriter } from '../../application/entity-schema-values';
import { resolveSchemaField, schemaEditorProperty } from '../../domain/property-schema';
import { isRecord } from '../../shared/record';
import type { EntityPropertyWriter } from '../../application/entity-properties';
import type { Entity } from '../../domain/entity';
import { PropertyEditor } from './property-editor';
import type { ReactNode } from 'react';

interface PropertyInspectorProps {
  entity: Entity;
  writer: EntityPropertyWriter & EntitySchemaValueWriter;
  registry: EntityTypeRegistry;
  manageType: () => void;
  addProperty: () => void;
  children?: ReactNode;
}

export function PropertyInspector({
  entity,
  writer,
  addProperty,
  children,
  registry,
  manageType,
}: PropertyInspectorProps) {
  const definition = registry.get(entity.type);
  const activeSchemas = definition?.properties.filter((schema) => !schema.retired) ?? [];
  const storedValues = isRecord(entity.schemaValues) ? entity.schemaValues : {};
  const orphanedKeys = Object.keys(storedValues).filter(
    (key) => !activeSchemas.some((schema) => schema.key === key),
  );
  return (
    <div className="tc-inspector-content">
      <section aria-label="Type properties" className="tc-type-properties">
        <h2>Type properties</h2>
        {!definition && (
          <p className="tc-property-issues">
            Unknown Entity Type: {entity.type}. Stored data remains available below and in Markdown.
          </p>
        )}
        {definition?.retired && (
          <p className="tc-inspector-hint">Retired type · existing notes remain editable.</p>
        )}
        {activeSchemas.length === 0 && (
          <p className="tc-inspector-hint">No reusable properties defined.</p>
        )}
        {activeSchemas.map((schema) => {
          const field = resolveSchemaField(schema, entity.schemaValues);
          const property = schemaEditorProperty(schema, field.value ?? '');
          return (
            <PropertyEditor
              key={schema.key}
              property={property}
              context={field}
              update={(_expected, value, context) =>
                writer.setSchemaValue(entity.id, context ?? field, value)
              }
              remove={(_expected, context) =>
                writer.setSchemaValue(entity.id, context ?? field, undefined)
              }
            />
          );
        })}
        {definition && (
          <button className="tc-add-property" onClick={manageType}>
            Manage {definition.label} properties
          </button>
        )}
        {entity.schemaValues !== undefined && !isRecord(entity.schemaValues) && (
          <p className="tc-property-issues">
            Malformed bs_schema_values: {JSON.stringify(entity.schemaValues)}. Repair it in Markdown
            before saving fields.
          </p>
        )}
        {orphanedKeys.length > 0 && (
          <details className="tc-orphan-values">
            <summary>Stored values without an active schema ({orphanedKeys.length})</summary>
            <dl>
              {orphanedKeys.map((key) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{JSON.stringify(storedValues[key])}</dd>
                </div>
              ))}
            </dl>
            <p className="tc-inspector-hint">
              Retired or unknown properties are preserved. Restore their schema or edit the Markdown
              note.
            </p>
          </details>
        )}
      </section>
      <h2>Local properties</h2>
      {entity.properties.length === 0 && (
        <p className="tc-inspector-hint">Add the details that matter to this entity.</p>
      )}

      {entity.properties.map((property) => (
        <PropertyEditor
          key={property.key}
          property={property}
          update={(expected, value) => writer.updateProperty(entity.id, expected, value)}
          remove={(expected) => writer.removeProperty(entity.id, expected)}
        />
      ))}

      <button className="tc-add-property" aria-label="+ Add property" onClick={addProperty}>
        + Add local property
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

      {children}

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
