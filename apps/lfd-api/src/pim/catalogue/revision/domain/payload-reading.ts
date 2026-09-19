/**
 * **Lire une charge du journal sans la croire.**
 *
 * Une charge est un `jsonb` : elle a la forme que son écrivain lui a donnée le
 * jour de l'écriture, et plusieurs formes coexistent en base (le journal ne se
 * réécrit pas). Ces lecteurs rendent `null` sur ce qu'ils ne reconnaissent pas
 * plutôt que de lever — une attribution qui tombe pour une ligne ancienne
 * priverait tout le diff de ses auteurs.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Le sous-objet `key` d'une charge, ou `null` s'il n'y en a pas. */
export function readObject(payload: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const value: unknown = payload[key];
  return isRecord(value) ? { ...value } : null;
}

/** La valeur scalaire `key` d'une charge, dite en texte, ou `null`. */
export function readScalar(payload: unknown, key: string): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const value: unknown = payload[key];
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" ? String(value) : null;
}
