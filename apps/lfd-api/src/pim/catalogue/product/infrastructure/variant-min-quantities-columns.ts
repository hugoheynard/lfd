import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import {
  MIN_QUANTITY_AUDIENCES,
  minQuantities,
  type MinQuantities,
  type MinQuantityAudience,
} from "../domain/value-objects/min-quantities.js";

/** Une case de la matrice telle que `variant_min_quantity` la porte, contexte par sa clé. */
export interface MinQuantityRow {
  readonly audience: string;
  readonly quantity: number;
  readonly context: { readonly key: string };
}

/** Ce que la lecture de la fiche inclut : la clé du contexte, jamais son id. */
export const MIN_QUANTITIES_INCLUDE = {
  select: { audience: true, quantity: true, context: { select: { key: true } } },
} as const;

/**
 * Une audience stockée que ce code ne connaît pas — le `CHECK` de la table
 * l'interdit ; si elle arrive, la base a été modifiée hors du code.
 */
export class StoredMinQuantityAudienceError extends TechnicalError {
  constructor(sku: string, value: string) {
    super(
      "variant_min_quantity.audience_unknown",
      `La déclinaison ${sku} porte une quantité minimale pour une clientèle inconnue ` +
        `(« ${value} ») : seules « pro » et « public » existent. La base a été modifiée hors ` +
        `du code — prévenir l'équipe technique.`,
    );
  }
}

/** Les lignes → la matrice, revalidée (une ligne relue n'est pas passée par le contrat). */
export function minQuantitiesOf(sku: string, rows: readonly MinQuantityRow[]): MinQuantities {
  const matrix: Record<MinQuantityAudience, Record<string, number>> = { pro: {}, public: {} };
  for (const row of rows) {
    const audience = MIN_QUANTITY_AUDIENCES.find((known) => known === row.audience);
    if (audience === undefined) {
      throw new StoredMinQuantityAudienceError(sku, row.audience);
    }
    matrix[audience][row.context.key] = row.quantity;
  }
  return minQuantities(matrix);
}

/** La matrice → une ligne par case réglée. */
export function minQuantityRows(matrix: MinQuantities): readonly {
  readonly audience: MinQuantityAudience;
  readonly contextKey: string;
  readonly quantity: number;
}[] {
  return MIN_QUANTITY_AUDIENCES.flatMap((audience) =>
    Object.entries(matrix[audience]).map(([contextKey, quantity]) => ({
      audience,
      contextKey,
      quantity,
    })),
  );
}
