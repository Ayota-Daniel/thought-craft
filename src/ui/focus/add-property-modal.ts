import { Modal, type App } from 'obsidian';
import type { NewProperty, PropertyType } from '../../domain/custom-property';

const PROPERTY_TYPES: readonly { value: PropertyType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'rating', label: 'Rating' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'select', label: 'Select' },
];

export class AddPropertyModal extends Modal {
  private pending = false;

  constructor(
    app: App,
    private addProperty: (input: NewProperty) => Promise<void>,
    private onClosed: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Add property');
    this.modalEl.addClass('tc-add-property-modal');
    const form = this.contentEl.createEl('form', { cls: 'tc-property-form' });

    const nameLabel = form.createEl('label', { text: 'Property name' });
    const nameInput = nameLabel.createEl('input', {
      type: 'text',
      attr: { required: 'true', placeholder: 'Originality, tone, importance…' },
    });

    const typeLabel = form.createEl('label', { text: 'Property type' });
    const typeInput = typeLabel.createEl('select');
    for (const propertyType of PROPERTY_TYPES) {
      typeInput.createEl('option', { text: propertyType.label, value: propertyType.value });
    }

    const maximumLabel = form.createEl('label', { text: 'Rating maximum' });
    const maximumInput = maximumLabel.createEl('input', {
      type: 'number',
      value: '5',
      attr: { min: '1', step: '1' },
    });

    const optionsLabel = form.createEl('label', { text: 'Options — one per line' });
    const optionsInput = optionsLabel.createEl('textarea', { attr: { rows: '4' } });

    const updateFields = () => {
      maximumLabel.hidden = typeInput.value !== 'rating';
      optionsLabel.hidden = typeInput.value !== 'select';
    };

    typeInput.addEventListener('change', updateFields);
    updateFields();

    const errorEl = form.createDiv({ cls: 'tc-error', attr: { role: 'alert' } });
    const footer = form.createDiv({ cls: 'tc-property-form-footer' });
    const cancelButton = footer.createEl('button', { text: 'Cancel', type: 'button' });
    const submitButton = footer.createEl('button', {
      text: 'Add property',
      type: 'submit',
      cls: 'mod-cta',
    });

    cancelButton.addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.pending) {
        return;
      }

      const type = typeInput.value as PropertyType;
      const input: NewProperty = { label: nameInput.value, type };

      if (type === 'rating') {
        input.max = Number(maximumInput.value);
      }
      if (type === 'select') {
        input.options = optionsInput.value.split(/\r?\n/).filter((option) => option.trim());
      }

      this.pending = true;
      submitButton.disabled = true;
      errorEl.setText('');

      void this.addProperty(input)
        .then(() => {
          this.close();
        })
        .catch((error: unknown) => {
          errorEl.setText(error instanceof Error ? error.message : 'Could not add this property.');
        })
        .finally(() => {
          this.pending = false;
          submitButton.disabled = false;
        });
    });

    nameInput.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }
}
