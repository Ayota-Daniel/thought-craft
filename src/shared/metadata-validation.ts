const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) {
    return false;
  }

  if (!Number.isFinite(Date.parse(value))) {
    return false;
  }

  // Date.parse normalizes invalid days such as February 30.
  const day = value.slice(0, 10);
  const calendarDate = new Date(day + 'T00:00:00Z');

  return calendarDate.toISOString().slice(0, 10) === day;
}
