import { NoNegotiatedLineToCarryError } from "../pricing-errors.js";
import type { AmendedGrid, MercurialeAmendmentDraft } from "./mercuriale-amendment.js";
import { carriedSegment } from "./mercuriale-segments.js";

/** Le report d'une ancienne référence sur celle qui en est née (§ 6 du plan). */
export interface CarryOver {
  readonly fromSku: string;
  readonly toSku: string;
  readonly reason: string;
}

/**
 * **L'avenant du report** (`plan-tarif-date-sur-une-reference.md`, § 6 — le
 * geste L7c) : les paliers de la ligne en cours de l'ancienne référence (ou
 * de la prochaine, si elle n'a pas encore commencé), posés sur la nouvelle à
 * partir de maintenant — jamais avant le début de cette ligne, sans quoi un
 * report sur une mercuriale programmée sortirait du document —, jusqu'à la
 * fin du document.
 *
 * L'ancienne ligne n'est pas arrêtée : la référence n'est plus en vente, elle
 * ne fait plus de prix. La filiation (« `toSku` est né de `fromSku` ») est au
 * catalogue : le handler la vérifie avant, l'agrégat ne la voit pas.
 *
 * @throws {NoNegotiatedLineToCarryError} l'ancienne référence n'a plus de prix ici.
 */
export function carryOverDraft(
  grid: AmendedGrid & { readonly id: string },
  carry: CarryOver,
  now: Date,
): MercurialeAmendmentDraft {
  const source = carriedSegment(grid, carry.fromSku, now);
  if (source === null) {
    throw new NoNegotiatedLineToCarryError(carry.fromSku, grid.id);
  }
  return {
    lines: [{ sku: carry.toSku, tiers: source.line.tiers }],
    endedSkus: [],
    validFrom: source.from.getTime() > now.getTime() ? source.from : now,
    validTo: null,
    reason: carry.reason,
    origin: { kind: "detached", fromSku: carry.fromSku, fromMercurialeId: grid.id },
  };
}
