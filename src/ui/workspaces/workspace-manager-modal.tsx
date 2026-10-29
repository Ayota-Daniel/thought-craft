import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { WorkspaceRegistry } from '../../application/workspace-registry';
import { typeIdForLabel, type EntityTypeRegistry } from '../../application/entity-type-registry';
import type {
  WorkspaceExperienceId,
  WorkspaceRelationTypeDefinition,
} from '../../domain/workspace';

export class WorkspaceManagerModal extends Modal {
  private root: Root | null = null;
  constructor(
    app: App,
    private workspaces: WorkspaceRegistry,
    private types: EntityTypeRegistry,
    private closed: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText('Workspaces');
    this.modalEl.addClass('tc-workspace-manager');
    this.root = createRoot(this.contentEl);
    this.root.render(<WorkspaceManager workspaces={this.workspaces} types={this.types} />);
  }
  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.closed();
  }
}

function TypeChoices({
  types,
  selected,
  change,
  legend,
}: {
  types: EntityTypeRegistry;
  selected: readonly string[];
  change: (ids: string[]) => void;
  legend: string;
}) {
  const choices = [...new Set([...types.getAll().map((type) => type.id), ...selected])];
  return (
    <fieldset className="tc-type-choices">
      <legend>{legend}</legend>
      {choices.map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={(event) => {
              change(
                event.target.checked
                  ? [...selected, id]
                  : selected.filter((current) => current !== id),
              );
            }}
          />
          {types.label(id)}
          {types.get(id)?.retired ? ' · Retired globally' : ''}
        </label>
      ))}
    </fieldset>
  );
}

function WorkspaceManager({
  workspaces,
  types,
}: {
  workspaces: WorkspaceRegistry;
  types: EntityTypeRegistry;
}) {
  const [, refresh] = useState(0);
  const [selectedId, setSelectedId] = useState(workspaces.getActive().id);
  const [creating, setCreating] = useState(false);
  const [relation, setRelation] = useState<WorkspaceRelationTypeDefinition | 'new' | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => workspaces.subscribe(() => refresh((version) => version + 1)), [workspaces]);
  useEffect(() => types.subscribe(() => refresh((version) => version + 1)), [types]);
  const workspace = workspaces.get(selectedId);

  async function save(operation: () => Promise<void>): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save workspace.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="tc-types-layout">
      <nav aria-label="Workspaces">
        {workspaces.getAll().map((item) => (
          <button
            key={item.id}
            aria-current={!creating && selectedId === item.id ? 'page' : undefined}
            onClick={() => {
              setSelectedId(item.id);
              setCreating(false);
              setRelation(null);
              setError('');
            }}
          >
            {item.label}
            {item.retired ? ' · Retired' : ''}
          </button>
        ))}
        <button
          onClick={() => {
            setCreating(true);
            setRelation(null);
            setError('');
          }}
        >
          + Create workspace
        </button>
      </nav>
      <section className="tc-type-detail" aria-label="Workspace definition">
        <p className="tc-inspector-hint">
          Workspace context controls new creation. Global entity schemas and existing notes stay
          intact.
        </p>
        {creating ? (
          <WorkspaceForm
            key="new"
            types={types}
            pending={pending}
            cancel={() => setCreating(false)}
            submit={(input) =>
              save(async () => {
                await workspaces.create(input);
                setSelectedId(typeIdForLabel(input.id));
                setCreating(false);
              })
            }
          />
        ) : (
          workspace && (
            <>
              <h2>
                {workspace.label}
                {workspace.retired ? ' · Retired' : ''}
              </h2>
              <p className="tc-inspector-hint">
                ID: <code>{workspace.id}</code>
                {workspace.builtIn ? ' · Built-in' : ''}
              </p>
              <WorkspaceForm
                key={workspace.id + JSON.stringify(workspace)}
                types={types}
                workspace={workspace}
                pending={pending}
                submit={(input) => save(() => workspaces.update(workspace.id, input))}
              />
              {!workspace.builtIn && (
                <button
                  disabled={pending}
                  onClick={() =>
                    void save(() =>
                      workspaces.update(workspace.id, { retired: !workspace.retired }),
                    )
                  }
                >
                  {workspace.retired ? 'Restore workspace' : 'Retire workspace'}
                </button>
              )}
              <h3>Workspace relations</h3>
              <p className="tc-inspector-hint">
                Universal relations are always available. Custom relations stay within this
                workspace.
              </p>
              <ul className="tc-schema-list">
                {workspace.relationTypes.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        setRelation(item);
                        setError('');
                      }}
                    >
                      {item.label}
                    </button>
                    <span>
                      {item.sourceEntityTypeIds.map((id) => types.label(id)).join(', ') ||
                        'Any enabled type'}{' '}
                      →{' '}
                      {item.targetEntityTypeIds.map((id) => types.label(id)).join(', ') ||
                        'Any enabled type'}
                      {item.retired ? ' · Retired' : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                disabled={pending}
                onClick={() => {
                  setRelation('new');
                  setError('');
                }}
              >
                + Add relation type
              </button>
              {relation && (
                <RelationForm
                  key={workspace.id + (relation === 'new' ? 'new' : relation.id)}
                  types={types}
                  pending={pending}
                  relation={relation === 'new' ? undefined : relation}
                  cancel={() => setRelation(null)}
                  submit={(input) =>
                    save(async () => {
                      if (relation === 'new') {
                        await workspaces.addRelationType(workspace.id, input);
                      } else {
                        await workspaces.updateRelationType(workspace.id, relation.id, input);
                      }
                      setRelation(null);
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
        {workspaces.issues.length > 0 && (
          <p className="tc-error">
            Some saved workspace definitions could not be read. Their original configuration is
            preserved.
          </p>
        )}
      </section>
    </div>
  );
}

interface WorkspaceFormInput {
  id: string;
  label: string;
  description: string;
  enabledExperiences: readonly WorkspaceExperienceId[];
  enabledEntityTypeIds: readonly string[];
}

function WorkspaceForm({
  workspace,
  types,
  pending,
  submit,
  cancel,
}: {
  workspace?: Omit<WorkspaceFormInput, 'description'> & { description?: string };
  types: EntityTypeRegistry;
  pending: boolean;
  submit: (input: WorkspaceFormInput) => Promise<void>;
  cancel?: () => void;
}) {
  const [label, setLabel] = useState(workspace?.label ?? '');
  const [id, setId] = useState(workspace?.id ?? '');
  const [customId, setCustomId] = useState(false);
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [experiences, setExperiences] = useState<readonly WorkspaceExperienceId[]>(
    workspace?.enabledExperiences ?? [],
  );
  const [enabled, setEnabled] = useState<readonly string[]>(
    workspace?.enabledEntityTypeIds ?? ['idea'],
  );
  return (
    <form
      className="tc-property-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({
          id,
          label,
          description,
          enabledExperiences: experiences,
          enabledEntityTypeIds: enabled,
        });
      }}
    >
      {!workspace && <h2>Create workspace</h2>}
      <label>
        Name
        <input
          type="text"
          required
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            if (!workspace && !customId) {
              setId(typeIdForLabel(event.target.value));
            }
          }}
        />
      </label>
      {!workspace && (
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
      )}
      <label>
        Description
        <textarea
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <fieldset className="tc-type-choices">
        <legend>Specialized experiences</legend>
        <label>
          <input
            type="checkbox"
            checked={experiences.includes('story')}
            onChange={(event) => setExperiences(event.target.checked ? ['story'] : [])}
          />
          Story
        </label>
        <p className="tc-inspector-hint">
          Organize writing material. Entity types are enabled separately below.
        </p>
      </fieldset>
      <TypeChoices
        types={types}
        selected={enabled}
        change={setEnabled}
        legend="Enabled entity types"
      />
      <div className="tc-property-form-footer">
        <button className="mod-cta" disabled={pending} type="submit">
          {workspace ? 'Save workspace' : 'Create workspace'}
        </button>
        {cancel && (
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function RelationForm({
  relation,
  types,
  pending,
  submit,
  cancel,
}: {
  relation?: WorkspaceRelationTypeDefinition;
  types: EntityTypeRegistry;
  pending: boolean;
  submit: (input: WorkspaceRelationTypeDefinition) => Promise<void>;
  cancel: () => void;
}) {
  const [label, setLabel] = useState(relation?.label ?? '');
  const [id, setId] = useState(relation?.id ?? '');
  const [customId, setCustomId] = useState(false);
  const [sources, setSources] = useState<readonly string[]>(relation?.sourceEntityTypeIds ?? []);
  const [targets, setTargets] = useState<readonly string[]>(relation?.targetEntityTypeIds ?? []);
  const [retired, setRetired] = useState(relation?.retired ?? false);
  return (
    <form
      className="tc-property-form tc-schema-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({
          id,
          label,
          sourceEntityTypeIds: sources,
          targetEntityTypeIds: targets,
          retired,
        });
      }}
    >
      <h3>{relation ? 'Edit relation type' : 'Add relation type'}</h3>
      <label>
        Relation name
        <input
          type="text"
          required
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            if (!relation && !customId) {
              setId(typeIdForLabel(event.target.value));
            }
          }}
        />
      </label>
      <label>
        Relation ID
        <input
          type="text"
          disabled={Boolean(relation)}
          required
          value={id}
          onChange={(event) => {
            setCustomId(true);
            setId(event.target.value);
          }}
        />
      </label>
      <p className="tc-inspector-hint">
        No checked restriction means any enabled, active entity type. Restrictions apply to new
        links; old values remain preserved.
      </p>
      <TypeChoices types={types} selected={sources} change={setSources} legend="From types" />
      <TypeChoices types={types} selected={targets} change={setTargets} legend="To types" />
      {relation && (
        <label className="tc-inline-check">
          <input
            type="checkbox"
            checked={retired}
            onChange={(event) => setRetired(event.target.checked)}
          />
          Retired (existing links remain)
        </label>
      )}
      <div className="tc-property-form-footer">
        <button className="mod-cta" type="submit" disabled={pending}>
          {relation ? 'Save relation type' : 'Create relation type'}
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
