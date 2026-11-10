import type { SaleUnit } from "./resupply-sale-unit.js";
import type { ResupplyLineShape } from "./resupply-line-shape.js";

/** Ce qu'il faut d'un réassort envoyé pour en attendre la réception. */
export interface ReceivableResupply {
  readonly id: string;
  readonly siteId: string;
  readonly serviceDay: string;
  readonly lines: readonly ResupplyLineShape[];
}

/**
 * L'emballé d'une fiche de réassort close, tel que le colisage le rend :
 * SKU → quantité et unité (L2b-3). Déclaré ici pour que le domaine ne
 * dépende pas du canal ; `PackedResupplyLines` lui est conforme.
 */
export type PackedLines = ReadonlyMap<
  string,
  { readonly quantity: number; readonly saleUnit: SaleUnit }
>;

function packedOf(packed: PackedLines | null, sku: string, saleUnit: SaleUnit): number | undefined {
  const line = packed?.get(sku);
  return line !== undefined && line.saleUnit === saleUnit ? line.quantity : undefined;
}

/**
 * Les lignes attendues : l'emballé s'il est connu, sinon le demandé (lot
 * R3b, §13.1 point 6). Partagé avec la page de réception, qui montre
 * l'attendu avant « Réceptionner ». L'emballé du colisage porte son unité
 * (L2b-3) : des grammes au poids. Un emballé d'une autre unité que la
 * ligne ne la remplace pas — la ligne garde son demandé plutôt que de lire
 * des grammes comme des pièces (le fournil refuse ce mélange à l'arrêt).
 */
export function expectedLinesOf(
  resupply: Pick<ReceivableResupply, "lines">,
  packed: PackedLines | null,
): readonly ResupplyLineShape[] {
  return resupply.lines.map((line) => ({
    sku: line.sku,
    label: line.label,
    quantity: packedOf(packed, line.sku, line.saleUnit) ?? line.quantity,
    saleUnit: line.saleUnit,
  }));
}
