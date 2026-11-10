import type { SaleUnit } from "@lfd/money";

import type { DeliveryNoteState } from "../entities/delivery-note.js";

/**
 * Une ligne de commande telle que le manque la lit : ce qui a été commandé.
 * Des pièces, ou des GRAMMES si `saleUnit = weight`.
 */
export interface OrderedLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/** Ce qui manque encore après un BL : un article, et combien. */
export interface UndeliveredLine {
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

const VOIDED = "voided";

function keyOf(line: { readonly sku: string; readonly saleUnit: SaleUnit }): string {
  return `${line.saleUnit}:${line.sku}`;
}

/**
 * **Ce que la commande attend encore, une fois ce BL parti** (Hugo,
 * 2026-11-03 : « seulement les lignes remises » à l'impression, et une mention
 * « Non livré » sous le tableau).
 *
 * Commandé − Σ des quantités des BL non annulés de rang ≤ celui-ci, par
 * article (SKU et unité) — jamais par rang de ligne : un reliquat n'a pas à
 * reprendre l'ordre de la commande. Sur le premier BL d'un départ incomplet,
 * c'est exactement « commandé − livré » ; sur un reliquat, ce qui manque après
 * lui. Pur : les données du BL ne changent pas, seul le papier les lit.
 *
 * Dans l'ordre des lignes de commande ; vide quand rien ne manque.
 */
export function undeliveredOf(
  ordered: readonly OrderedLine[],
  notes: readonly DeliveryNoteState[],
  note: DeliveryNoteState,
): readonly UndeliveredLine[] {
  const counted = notes.filter(
    (other) => other.id !== note.id && other.status !== VOIDED && other.rank <= note.rank,
  );
  const delivered = new Map<string, number>();
  for (const line of [...counted, note].flatMap((n) => n.lines)) {
    delivered.set(keyOf(line), (delivered.get(keyOf(line)) ?? 0) + line.quantity);
  }
  const missing: UndeliveredLine[] = [];
  for (const line of ordered) {
    const left = delivered.get(keyOf(line)) ?? 0;
    const used = Math.min(left, line.quantity);
    delivered.set(keyOf(line), left - used);
    if (line.quantity > used) {
      missing.push({
        productName: line.productName,
        quantity: line.quantity - used,
        saleUnit: line.saleUnit,
      });
    }
  }
  return missing;
}
