import type { ShopAudience } from "../../domain/ports/catalog.reader.js";

/**
 * Valide un ou plusieurs articles arrivés du référentiel, pour une ou deux
 * audiences (lot 3 de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md` ;
 * côté pro, décision de Hugo du 2026-10-15) : « Afficher » sur une ligne,
 * « Tout afficher » sur la liste.
 */
export class ApproveReviewCommand {
  constructor(
    readonly skus: readonly string[],
    readonly audiences: readonly ShopAudience[],
  ) {}
}
