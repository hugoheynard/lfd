import { createHash } from "node:crypto";

/**
 * L'**empreinte** d'une valeur — SHA-256 de sa forme canonique.
 *
 * Canonique veut dire : clés triées, à tous les étages. Sans ça, deux payloads
 * identiques écrits dans un ordre différent auraient deux empreintes, et le
 * magasin partagé se remplirait de doublons qu'aucun diff ne saurait rapprocher.
 * L'ordre des clés d'un objet JavaScript dépend de l'ordre d'insertion : il
 * suffit qu'un champ change de place dans un `map` pour tout dédoubler.
 *
 * Les TABLEAUX gardent leur ordre : il porte du sens (l'ordre des visuels, celui
 * des déclinaisons). Les trier serait effacer une information.
 */
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/** La forme canonique — c'est elle qu'on hache, jamais l'objet tel quel. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/**
 * Une valeur **réellement** sérialisable en JSON.
 *
 * Le type existe parce que le magasin est adressé par contenu : ce qui est
 * stocké doit être exactement ce qui a été haché, sans quoi une empreinte
 * cesserait de désigner son payload. Un `Record<string, unknown>` ne le
 * garantit pas — il accepte une `Date`, une fonction, un `Map`, que
 * `JSON.stringify` transforme ou laisse tomber en silence.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/**
 * Vérifie qu'une valeur est du JSON, et la rend typée comme telle.
 *
 * Une VÉRIFICATION, pas une conversion de complaisance : elle refuse plutôt que
 * de laisser passer ce que `JSON.stringify` déformerait. Le prix — une marche
 * de plus sur la frontière — achète la garantie que l'empreinte et la ligne
 * stockée parlent du même contenu.
 */
export function toJsonObject(value: Record<string, unknown>): JsonObject {
  const json = toJson(value);
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new TypeError("Un payload de révision est un objet.");
  }
  return json;
}

function toJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      // `NaN` et `Infinity` deviennent `null` chez `JSON.stringify` : le payload
      // stocké ne serait alors plus celui qu'on a haché.
      throw new TypeError(`Nombre non sérialisable dans un payload : ${String(value)}.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }
  if (isRecord(value)) {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      // Une clé indéfinie est une clé ABSENTE, comme chez `JSON.stringify`.
      if (item !== undefined) {
        out[key] = toJson(item);
      }
    }
    return out;
  }
  throw new TypeError(`Valeur non sérialisable dans un payload : ${typeof value}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    // `undefined` disparaît de `JSON.stringify` : le retirer ICI évite qu'une
    // clé présente-mais-indéfinie et une clé absente donnent deux empreintes
    // pour le même contenu.
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return Object.fromEntries(entries.map(([key, item]) => [key, sortDeep(item)]));
}
