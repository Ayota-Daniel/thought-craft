import { useEffect, useRef, useState } from 'react';
import type { CustomProperty, PropertyValue } from '../../domain/custom-property';

interface PropertyEditorProps {
  property: CustomProperty;
  update: (expected: CustomProperty, value: PropertyValue) => Promise<void>;
  remove: (expected: CustomProperty) => Promise<void>;
}

export function PropertyEditor({ property, update, remove }: PropertyEditorProps) {
  const [draft, setDraft] = useState(String(property.value));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const editingVersion = useRef<CustomProperty | null>(null);
  const operationPending = useRef(false);
  const draftId = `tc-property-${property.key}`;

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

    await runOperation(() => update(expected, value));
  }

  function discardDraft(): void {
    setDraft(String(property.value));
    setDirty(false);
    setError('');
    editingVersion.current = null;
  }

  function changeDraft(value: string): void {
    if (!dirty) {
      editingVersion.current = property;
    }
    setDraft(value);
    setDirty(true);
  }

  return (
    <div className="tc-property-row" data-property-key={property.key}>
      <div className="tc-property-heading">
        <label htmlFor={draftId}>{property.label}</label>
        <button
          className="tc-property-remove"
          aria-label={`Remove ${property.label}`}
          disabled={saving}
          onClick={() => setConfirmRemoval(true)}
        >
          Remove
        </button>
      </div>

      <div className="tc-property-control">
        {property.type === 'boolean' && (
          <input
            id={draftId}
            type="checkbox"
            checked={draft === 'true'}
            disabled={saving}
            onChange={(event) => {
              const value = event.target.checked;
              setDraft(String(value));
              setDirty(true);
              void runOperation(() => update(property, value));
            }}
          />
        )}

        {property.type === 'select' && (
          <select
            id={draftId}
            value={draft}
            disabled={saving}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              setDirty(true);
              void runOperation(() => update(property, value));
            }}
          >
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
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${draftId}-error` : undefined}
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
          <span>Remove this property?</span>
          <button
            disabled={saving}
            onClick={() => {
              void runOperation(() => remove(property));
            }}
          >
            Remove property
          </button>
          <button onClick={() => setConfirmRemoval(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
