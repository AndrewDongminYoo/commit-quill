/**
 * Narrowing helpers for provider responses.
 *
 * Everything here crosses a trust boundary: it arrives from a remote service
 * over which this extension has no control, so nothing is assumed about its
 * shape. The five response shapes are shallow enough that these guards say
 * what a schema library would, without shipping one to every user's editor.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The array at `key`, or an empty array when it is missing or not an array. */
export function arrayAt(value: unknown, key: string): readonly unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  const found = value[key];
  return Array.isArray(found) ? found : [];
}

/** The non-empty string at `key`, or `undefined` for anything else. */
export function stringAt(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const found = value[key];
  return typeof found === "string" && found.length > 0 ? found : undefined;
}

/** The record at `key`, or `undefined` when it is missing or not a record. */
export function recordAt(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const found = value[key];
  return isRecord(found) ? found : undefined;
}
