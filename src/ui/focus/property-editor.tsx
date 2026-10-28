import type { ResolvedSchemaField } from '../../domain/property-schema';
import { useEffect, useRef, useState } from 'react';
import type { CustomProperty, PropertyValue } from '../../domain/custom-property';

interface PropertyEditorProps {
  property: CustomProperty;
  update: (
    expected: CustomProperty,
    value: PropertyValue,
    context?: ResolvedSchemaField,
  ) => Promise<void>;
  remove: (expected: CustomProperty, context?: ResolvedSchemaField) => Promise<void>;
  context?: ResolvedSchemaField;
}

export function PropertyEditor({ property, update, remove, context }: PropertyEditorProps) {
  const [draft, setDraft] = useState(String(property.value));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const editingVersion = useRef<CustomProperty | null>(null);
  const operationPending = useRef(false);
  const draftId = `tc-${context ? 'schema' : 'property'}-${property.key}`;
  const removalVersion = useRef<{ property: CustomProperty; context?: ResolvedSchemaField } | null>(
    null,
  );
  const editingContext = useRef<ResolvedSchemaField | undefined>(undefined);

  useEffect(() => {
    if (!dirty) {
      setDraft(String(property.value));
    }
  }, [property.value, dirty]);

  async function runOperation(operation: () => Promise<void>): Promise<void> {
    if (operationPending.current) {
      return;
    }

    operationPending.current = true;
    setSaving(true);
    setError('');

    try {
      await operation();
      setDirty(false);
      editingVersion.current = null;
      editingContext.current = undefined;
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : 'The property could not be saved.',
      );
    } finally {
      operationPending.current = false;
      setSaving(false);
    }
  }

  async function commitDraft(): Promise<void> {
    if (!dirty || saving) {
      return;
    }

    const expected = editingVersion.current ?? property;
    let value: PropertyValue = draft;

    if (property.type === 'number' || property.type === 'rating') {
      if (!draft.trim()) {
        setError('Enter a number before saving.');
        return;
      }
      value = Number(draft);
    }

    await runOperation(() => update(expected, value, editingContext.current ?? context));
  }

  function discardDraft(): void {
    setDraft(String(property.value));
    setDirty(false);
    setError('');
    editingVersion.current = null;
    editingContext.current = undefined;
  }

  function changeDraft(value: string): void {
    if (!dirty) {
      editingVersion.current = property;
      editingContext.current = context;
    }
    setDraft(value);
    setDirty(true);
  }

  return (
    <div
      className="tc-property-row"
      data-property-key={context ? undefined : property.key}
      data-schema-key={context ? property.key : undefined}
    >
      <div className="tc-property-heading">
        <label htmlFor={draftId}>{property.label}</label>
        <button
          className="tc-property-remove"
          aria-label={`${context ? 'Reset' : 'Remove'} ${property.label}`}
          disabled={saving || (Boolean(context) && context?.source !== 'explicit')}
          onClick={() => {
            removalVersion.current = { property, context };
            setConfirmRemoval(true);
          }}
        >
          {context ? 'Reset' : 'Remove'}
        </button>
      </div>

      {context && (
        <p className="tc-inspector-hint" id={`${draftId}-status`} role="status">
          {context.source === 'missing'
            ? '— Missing'
            : context.source === 'default'
              ? 'Schema default'
              : 'Explicit value'}
          {context.issue
            ? ` · Incompatible: ${JSON.stringify(context.value)}. ${context.issue}`
            : ''}
        </p>
      )}
      <div className="tc-property-control">
        {property.type === 'boolean' && (
          <input
            id={draftId}
            aria-invalid={Boolean(context?.issue)}
            aria-describedby={context ? `${draftId}-status` : undefined}
            type="checkbox"
            checked={draft === 'true'}
            ref={(input) => {
              if (input) {
                input.indeterminate = Boolean(
                  context && (context.source === 'missing' || context.issue),
                );
              }
            }}
            disabled={saving}
            onChange={(event) => {
              const value = event.target.checked;
              setDraft(String(value));
              setDirty(true);
              void runOperation(() => update(property, value, context));
            }}
          />
        )}

        {property.type === 'select' && (
          <select
            id={draftId}
            aria-invalid={Boolean(context?.issue)}
            aria-describedby={context ? `${draftId}-status` : undefined}
            value={draft}
            disabled={saving}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              setDirty(true);
              void runOperation(() => update(property, value, context));
            }}
          >
            {!property.options.includes(draft) && (
              <option value={draft} disabled>
                {context?.source === 'missing' ? '— Choose a value' : `Incompatible: ${draft}`}
              </option>
            )}
            {property.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}

        {(property.type === 'text' || property.type === 'number' || property.type === 'rating') && (
          <>
            <input
              id={draftId}
              type={property.type === 'text' ? 'text' : 'number'}
              value={draft}
              min={property.type === 'rating' ? 0 : undefined}
              max={property.type === 'rating' ? property.max : undefined}
              step={property.type === 'rating' ? 1 : 'any'}
              disabled={saving}
              aria-invalid={Boolean(error || context?.issue)}
              aria-describedby={
                error ? `${draftId}-error` : context ? `${draftId}-status` : undefined
              }
              onChange={(event) => changeDraft(event.target.value)}
              onBlur={() => {
                void commitDraft();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitDraft();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  discardDraft();
                }
              }}
            />
            {property.type === 'rating' && (
              <span className="tc-rating-maximum">/ {property.max}</span>
            )}
          </>
        )}
      </div>

      {saving && (
        <span className="tc-property-feedback" role="status">
          Saving…
        </span>
      )}
      {error && (
        <div className="tc-error" id={`${draftId}-error`} role="alert">
          {error}
          {dirty && <button onClick={discardDraft}>Discard draft</button>}
        </div>
      )}

      {confirmRemoval && (
        <div
          className="tc-remove-confirmation"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setConfirmRemoval(false);
            }
          }}
        >
          <span>
            {context
              ? 'Clear the explicit value and use the schema default?'
              : 'Remove this property?'}
          </span>
          <button
            disabled={saving}
            onClick={() => {
              const expected = removalVersion.current ?? { property, context };
              void runOperation(async () => {
                await remove(expected.property, expected.context);
                setConfirmRemoval(false);
              });
            }}
          >
            {context ? 'Reset value' : 'Remove property'}
          </button>
          <button onClick={() => setConfirmRemoval(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
