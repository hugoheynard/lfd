import type { CatalogMinQuantities } from "../domain/catalog-min-quantities.js";

/** Le plus petit minimum que le fil admet (v15) : 1 ne dit rien. */
const MIN_QUANTITY_FLOOR = 2;

/**
 * **Relit la quantité minimale** depuis la colonne `jsonb` `min_quantities`
 * (fil v15, `plan-quantite-minimale.md`), jumelle de `publicByContextOf`.
 *
 * `null` dès que la colonne n'est pas un objet : c'est l'état des lignes
 * d'avant la v15, qui se lit « on ne sait pas ». Une case mal formée est
 * ÉCARTÉE plutôt que de faire perdre les autres — le référentiel ne publie
 * que des entiers ≥ 2, et une case illisible ne s'invente pas en minimum.
 */
export function minQuantitiesOf(raw: unknown): CatalogMinQuantities | null {
  const record = objectOf(raw);
  if (record === null) {
    return null;
  }
  return { pro: rowOf(record["pro"]), public: rowOf(record["public"]) };
}

function rowOf(raw: unknown): Readonly<Record<string, number>> {
  const record = objectOf(raw) ?? {};
  const row: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      key.length > 0 &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= MIN_QUANTITY_FLOOR
    ) {
      row[key] = value;
    }
  }
  return row;
}

function objectOf(raw: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  return { ...raw };
}
