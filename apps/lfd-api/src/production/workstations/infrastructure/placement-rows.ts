import type { ProductStation } from "../domain/entities/product-placements.js";

/** Ce que les lectures de la carte prennent d'une ligne (produit, poste). */
export const PLACEMENT_SELECT = {
  productSku: true,
  workstationId: true,
  finishes: true,
  position: true,
} as const;

/** Une ligne (produit, poste), telle que les lectures la prennent. */
export interface PlacementRow {
  readonly productSku: string;
  readonly workstationId: string;
  readonly finishes: boolean;
  readonly position: number | null;
}

/** Référence produit → ses postes, tels que les lignes (produit, poste) les portent. */
export function placementsOf(
  rows: readonly PlacementRow[],
): ReadonlyMap<string, readonly ProductStation[]> {
  const byProduct = new Map<string, ProductStation[]>();
  for (const { productSku, workstationId, finishes, position } of rows) {
    byProduct.set(productSku, [
      ...(byProduct.get(productSku) ?? []),
      { workstationId, finishes, position },
    ]);
  }
  return byProduct;
}
