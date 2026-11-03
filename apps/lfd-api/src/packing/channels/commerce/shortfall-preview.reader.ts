import type { SaleUnit } from "@lfd/money";

import type { ShortfallRefusal } from "../../domain/services/shortfall-standing.js";

/**
 * Pourquoi le bac d'un envoi ne peut pas partir incomplet : pas encore tiré au
 * colisage (`not_drawn`), ou un refus de « Il manque » — feuille retirée, bac
 * fermé, comptée par contenants, départ déjà autorisé, rien ne manque.
 */
export type PackingShortfallRefusal = "not_drawn" | ShortfallRefusal;

/**
 * Une ligne de la feuille : ce qui est dû, et ce qui est au bac (borné au dû)
 * — des grammes si `saleUnit = "weight"`.
 */
export interface PackingBinLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: SaleUnit;
  readonly due: number;
  readonly packed: number;
}

/** L'aperçu du bac : le refus, ou chaque ligne avec ce qui est au bac. */
export type PackingShortfallPreview =
  | { readonly kind: "refused"; readonly refusal: PackingShortfallRefusal }
  | { readonly kind: "short"; readonly lines: readonly PackingBinLine[] };

/**
 * **« Ce bac peut-il partir incomplet, et avec quoi ? »** — la lecture du
 * départ incomplet au comptoir (lot C1b, plan
 * `documentation/comptoir/depart-incomplet.md`, §4.1 —
 * Hugo, 2026-11-03). Déclaré ET implémenté par le colisage, lu par le
 * commerce ; à part de `ShortfallFreezeDesk` (ISP) : une lecture n'a pas à
 * dépendre d'un geste.
 *
 * La règle est celle du geste (`PackingSheet.shortfallStanding`, que
 * `reportShortfall` applique en levant) sur la feuille la plus récente de
 * l'envoi, lue SANS verrou : un aperçu, pas une promesse — le geste relit
 * sous verrou et peut encore refuser.
 */
export abstract class ShortfallPreviewReader {
  abstract previewOf(orderId: string, rank: number): Promise<PackingShortfallPreview>;
}
