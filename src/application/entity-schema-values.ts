import type { PropertyValue } from '../domain/custom-property';
import type { ResolvedSchemaField } from '../domain/property-schema';

export interface EntitySchemaValueWriter {
  setSchemaValue(
    entityId: string,
    expected: ResolvedSchemaField,
    value: PropertyValue | undefined,
  ): Promise<void>;
}
