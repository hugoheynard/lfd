import { minQuantities, type MinQuantities } from "../domain/value-objects/min-quantities.js";

/** Les deux colonnes de `product_variant` qui portent la quantité minimale. */
export interface MinQuantityColumns {
  readonly proMinQuantity: number | null;
  readonly publicMinQuantity: number | null;
}

/** Les colonnes → la paire, revalidée (une ligne relue n'est pas passée par le contrat). */
export function minQuantitiesOf(row: MinQuantityColumns): MinQuantities {
  return minQuantities({ pro: row.proMinQuantity, public: row.publicMinQuantity });
}

/** La paire → les colonnes. */
export function minQuantityColumns(pair: MinQuantities): MinQuantityColumns {
  return { proMinQuantity: pair.pro, publicMinQuantity: pair.public };
}
