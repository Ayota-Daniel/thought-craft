import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState, type FormEvent } from 'react';
import { EntityTypeRegistry, typeIdForLabel } from '../../application/entity-type-registry';
import {
  propertyKeyForLabel,
  type PropertyType,
  type PropertyValue,
} from '../../domain/custom-property';
import type { PropertySchema } from '../../domain/property-schema';

export class TypeManagerModal extends Modal {
  private root: Root | null = null;
  constructor(
    app: App,
    private registry: EntityTypeRegistry,
    private selectedId: string | undefined,
    private closed: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText('Entity types');
    this.modalEl.addClass('tc-type-manager');
    this.root = createRoot(this.contentEl);
    this.root.render(<TypeManager registry={this.registry} initialId={this.selectedId} />);
  }
  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.closed();
  }
}

function TypeManager({
  registry,
  initialId,
}: {
  registry: EntityTypeRegistry;
  initialId?: string;
}) {
  const [, refresh] = useState(0);
  const [selectedId, setSelectedId] = useState(initialId ?? 'idea');
  const [creating, setCreating] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertySchema | 'new' | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => registry.subscribe(() => refresh((version) => version + 1)), [registry]);
  const selected = registry.get(selectedId);

  async function save(operation: () => Promise<void>): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save configuration.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="tc-types-layout">
      <nav aria-label="Entity types">
        {registry.getAll().map((type) => (
          <button
            key={type.id}
            aria-current={!creating && selectedId === type.id ? 'page' : undefined}
            onClick={() => {
              setSelectedId(type.id);
              setCreating(false);
              setEditingProperty(null);
              setError('');
            }}
          >
            {type.label}
            {type.retired ? ' · Retired' : ''}
          </button>
        ))}
        <button
          className="tc-add-property"
          onClick={() => {
            setCreating(true);
            setEditingProperty(null);
            setError('');
          }}
        >
          + Create type
        </button>
      </nav>
      <section className="tc-type-detail" aria-label="Type definition">
        <p className="tc-inspector-hint">
          Reusable definitions for this vault. Values stay in each Markdown note.
        </p>
        {creating ? (
          <NewTypeForm
            pending={pending}
            submit={(input) =>
              save(async () => {
                await registry.createCustomType(input);
                setSelectedId(typeIdForLabel(input.id));
                setCreating(false);
              })
            }
          />
        ) : (
          selected && (
            <>
              <h2>
                {selected.label}
                {selected.retired ? ' · Retired' : ''}
              </h2>
              <p className="tc-inspector-hint">
                ID: <code>{selected.id}</code>
                {selected.builtIn ? ' · Built-in' : ''}
              </p>
              <form
                className="tc-property-form"
                key={selected.id + selected.label + selected.folderName}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void save(() =>
                    registry.updateType(selected.id, {
                      label: String(data.get('label')),
                      folderName: String(data.get('folder')),
                    }),
                  );
                }}
              >
                <label>
                  Display name
                  <input type="text" name="label" defaultValue={selected.label} required />
                </label>
                <label>
                  Folder
                  <input type="text" name="folder" defaultValue={selected.folderName} required />
                </label>
                <p className="tc-inspector-hint">
                  {selected.id === 'idea'
                    ? 'Changes the last folder of the capture destination. Its parent remains managed in settings.'
                    : 'Relative to the Idea folder’s parent. Changes affect new notes only.'}
                </p>
                <div className="tc-property-form-footer">
                  <button type="submit" disabled={pending}>
                    Save type
                  </button>
                  {!selected.builtIn && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void save(() =>
                          registry.updateType(selected.id, { retired: !selected.retired }),
                        )
                      }
                    >
                      {selected.retired ? 'Restore type' : 'Retire type'}
                    </button>
                  )}
                </div>
              </form>
              <h3>Reusable properties</h3>
              <p className="tc-inspector-hint">
                Added fields appear on existing entities without rewriting their notes.
              </p>
              <ul className="tc-schema-list">
                {selected.properties.map((property) => (
                  <li key={property.key}>
                    <button
                      onClick={() => {
                        setEditingProperty(property);
                        setError('');
                      }}
                    >
                      {property.label}
                    </button>
                    <span>
                      {property.type}
                      {property.retired ? ' · Retired' : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                className="tc-add-property"
                disabled={pending}
                onClick={() => {
                  setEditingProperty('new');
                  setError('');
                }}
              >
                + Add schema property
              </button>
              {editingProperty && (
                <SchemaForm
                  key={selected.id + (editingProperty === 'new' ? 'new' : editingProperty.key)}
                  property={editingProperty === 'new' ? undefined : editingProperty}
                  pending={pending}
                  cancel={() => setEditingProperty(null)}
                  submit={(property) =>
                    save(async () => {
                      if (editingProperty === 'new') {
                        await registry.addProperty(selected.id, property);
                      } else {
                        await registry.updateProperty(selected.id, editingProperty.key, property);
                      }
                      setEditingProperty(null);
                    })
                  }
                />
              )}
            </>
          )
        )}
        {pending && <p role="status">Saving…</p>}
        {error && (
          <p className="tc-error" role="alert">
            {error}
          </p>
        )}
        {registry.issues.length > 0 && (
          <p className="tc-error">
            Some saved definitions could not be read; their original configuration has been
            retained.
          </p>
        )}
      </section>
    </div>
  );
}

function NewTypeForm({
  pending,
  submit,
}: {
  pending: boolean;
  submit: (input: { id: string; label: string; folderName: string }) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [id, setId] = useState('');
  const [folder, setFolder] = useState('');
  const [customId, setCustomId] = useState(false);
  const [customFolder, setCustomFolder] = useState(false);
  return (
    <form
      className="tc-property-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({ id, label, folderName: folder });
      }}
    >
      <h2>Create entity type</h2>
      <label>
        Name
        <input
          type="text"
          autoFocus
          required
          value={label}
          onChange={(event) => {
            const name = event.target.value;
            setLabel(name);
            if (!customId) {
              setId(typeIdForLabel(name));
            }
            if (!customFolder) {
              setFolder(name.trim());
            }
          }}
        />
      </label>
      <label>
        ID
        <input
          type="text"
          required
          value={id}
          onChange={(event) => {
            setCustomId(true);
            setId(event.target.value);
          }}
        />
      </label>
      <p className="tc-inspector-hint">
        Saved ID: {typeIdForLabel(id)}. This identity remains stable.
      </p>
      <label>
        Folder
        <input
          type="text"
          required
          value={folder}
          onChange={(event) => {
            setCustomFolder(true);
            setFolder(event.target.value);
          }}
        />
      </label>
      <button className="mod-cta" type="submit" disabled={pending}>
        Create type
      </button>
    </form>
  );
}

function SchemaForm({
  property,
  pending,
  submit,
  cancel,
}: {
  property?: PropertySchema;
  pending: boolean;
  submit: (property: PropertySchema) => Promise<void>;
  cancel: () => void;
}) {
  const [label, setLabel] = useState(property?.label ?? '');
  const [key, setKey] = useState(property?.key ?? '');
  const [type, setType] = useState<PropertyType>(property?.type ?? 'text');
  const [maximum, setMaximum] = useState(String(property?.max ?? 5));
  const [options, setOptions] = useState(property?.options?.join('\n') ?? '');
  const [hasDefault, setHasDefault] = useState(property?.defaultValue !== undefined);
  const [defaultValue, setDefaultValue] = useState(String(property?.defaultValue ?? ''));
  const [retired, setRetired] = useState(property?.retired ?? false);

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    let value: PropertyValue | undefined;
    if (hasDefault) {
      value =
        type === 'number' || type === 'rating'
          ? defaultValue.trim()
            ? Number(defaultValue)
            : NaN
          : type === 'boolean'
            ? defaultValue === 'true'
            : defaultValue;
    }
    void submit({
      key,
      label,
      type,
      retired,
      defaultValue: value,
      ...(type === 'rating' ? { max: Number(maximum) } : {}),
      ...(type === 'select'
        ? {
            options: options
              .split('\n')
              .map((option) => option.trim())
              .filter(Boolean),
          }
        : {}),
    });
  }

  return (
    <form className="tc-property-form tc-schema-form" onSubmit={onSubmit}>
      <h3>{property ? 'Edit schema property' : 'Add schema property'}</h3>
      <label>
        Property label
        <input
          type="text"
          autoFocus
          required
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            if (!property) {
              setKey(propertyKeyForLabel(event.target.value, []));
            }
          }}
        />
      </label>
      <label>
        Stable key
        <input
          type="text"
          required
          value={key}
          disabled={Boolean(property)}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <label>
        Property type
        <select
          aria-label="Property type"
          value={type}
          disabled={Boolean(property)}
          onChange={(event) => {
            setType(event.target.value as PropertyType);
            setHasDefault(false);
            setDefaultValue('');
          }}
        >
          {['text', 'number', 'rating', 'boolean', 'select'].map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      {type === 'rating' && (
        <label>
          Rating maximum
          <input
            type="number"
            min="1"
            step="1"
            required
            value={maximum}
            onChange={(event) => setMaximum(event.target.value)}
          />
        </label>
      )}
      {type === 'select' && (
        <label>
          Options (one per line)
          <textarea
            rows={4}
            required
            value={options}
            onChange={(event) => setOptions(event.target.value)}
          />
        </label>
      )}
      <label className="tc-inline-check">
        <input
          type="checkbox"
          checked={hasDefault}
          onChange={(event) => {
            setHasDefault(event.target.checked);
            if (type === 'boolean' && !defaultValue) {
              setDefaultValue('false');
            }
          }}
        />
        Use a virtual default
      </label>
      {hasDefault && (
        <label>
          Default value
          {type === 'boolean' || type === 'select' ? (
            <select
              aria-label="Default value"
              value={defaultValue}
              onChange={(event) => setDefaultValue(event.target.value)}
            >
              <option value="" disabled>
                Choose a default
              </option>
              {(type === 'boolean'
                ? ['false', 'true']
                : options
                    .split('\n')
                    .map((option) => option.trim())
                    .filter(Boolean)
              ).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type === 'text' ? 'text' : 'number'}
              step={type === 'rating' ? 1 : 'any'}
              value={defaultValue}
              onChange={(event) => setDefaultValue(event.target.value)}
            />
          )}
        </label>
      )}
      {property && (
        <label className="tc-inline-check">
          <input
            type="checkbox"
            checked={retired}
            onChange={(event) => setRetired(event.target.checked)}
          />
          Retired (stored values remain in notes)
        </label>
      )}
      <div className="tc-property-form-footer">
        <button className="mod-cta" disabled={pending} type="submit">
          Save property
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
