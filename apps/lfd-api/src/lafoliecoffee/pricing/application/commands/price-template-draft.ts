import type { SavePriceTemplatePayload } from "@lfd/contracts";

import type { PriceTemplate } from "../../domain/entities/price-template.js";
import type { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { assertOnSale } from "./sale-reference-support.js";

/** Ce qu'un gabarit composé ou révisé porte, tel que l'agrégat le reçoit. */
export type PriceTemplateDraft = Parameters<typeof PriceTemplate.compose>[1];

/**
 * La grille saisie, vérifiée puis mise à la forme de l'agrégat — partagée par
 * la composition et la révision d'un gabarit.
 *
 * Un gabarit est une mercuriale en attente : la faute de frappe se dit ici,
 * pas le jour où on l'applique à un client (L5).
 *
 * @throws les refus de `assertOnSale` (référence hors vente, article retiré).
 */
export async function priceTemplateDraftOf(
  references: SaleReferenceReader,
  payload: SavePriceTemplatePayload,
): Promise<PriceTemplateDraft> {
  await assertOnSale(
    references,
    payload.lines.map((line) => line.sku),
    "pro",
  );
  return {
    kind: payload.kind,
    label: payload.label,
    lines: payload.lines.map((line) => ({
      sku: line.sku,
      tiers: line.tiers,
      // Recopié tel quel : le volume prévu accompagne la grille, il ne change
      // aucun prix — `templateToRules` ne le lit même pas.
      plannedVolume: line.plannedVolume,
    })),
  };
}
