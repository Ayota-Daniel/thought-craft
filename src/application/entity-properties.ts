import type { CustomProperty, NewProperty, PropertyValue } from '../domain/custom-property';

export interface EntityPropertyWriter {
  addProperty(entityId: string, input: NewProperty): Promise<void>;
  updateProperty(entityId: string, property: CustomProperty, value: PropertyValue): Promise<void>;
  removeProperty(entityId: string, property: CustomProperty): Promise<void>;
}
