import { EmptyMercurialeError, ReversedValidityWindowError } from "../pricing-errors.js";
import { normalizeGrid } from "../pricing-grid.js";
import { IN_FORCE } from "../rule-lifecycle.js";
import type { CompanyMercurialeDraft, CompanyMercurialeState } from "./company-mercuriale-state.js";
import { checkedGeneralDiscount } from "./general-discount.js";
import { MERCURIALE_REFUSALS } from "./mercuriale-amendment-checks.js";
import { checkedAdmission, NO_PROMOTION_ADMITTED } from "./mercuriale-promotion-policy.js";

/**
 * L'état d'une mercuriale **posée** : fenêtre dans le bon sens, remise
 * générale vérifiée, grille normalisée, en vigueur et sans avenant.
 *
 * Les refus suivent cet ordre : fenêtre, remise générale, contenu vide, grille.
 *
 * @throws {ReversedValidityWindowError} fenêtre qui se ferme avant de s'ouvrir.
 * @throws les refus de `checkedGeneralDiscount`.
 * @throws {EmptyMercurialeError} ni ligne ni remise générale, ou une ligne sans palier.
 * @throws {DuplicateMercurialeSkuError} deux lignes sur le même article.
 * @throws {NonDecreasingMercurialeTiersError} une grille où commander plus
 *   coûte plus cher, ou deux paliers au même seuil.
 */
export function posedState(
  id: string,
  draft: CompanyMercurialeDraft,
  createdBy: string,
): CompanyMercurialeState {
  if (draft.validTo !== null && draft.validTo.getTime() <= draft.validFrom.getTime()) {
    throw new ReversedValidityWindowError(draft.validFrom, draft.validTo);
  }
  const generalDiscount =
    draft.generalDiscount === undefined || draft.generalDiscount === null
      ? null
      : checkedGeneralDiscount(draft.generalDiscount);
  if (draft.lines.length === 0 && generalDiscount === null) {
    throw new EmptyMercurialeError();
  }
  return {
    ...draft,
    promotionPolicy: checkedAdmission(draft.promotionPolicy ?? NO_PROMOTION_ADMITTED),
    generalDiscount,
    // La grille vide n'est admise qu'à côté d'une remise générale (D5) ;
    // `normalizeGrid` la refuse, et garde ce refus pour les gabarits.
    lines: draft.lines.length === 0 ? [] : normalizeGrid(draft.lines, MERCURIALE_REFUSALS),
    id,
    createdBy,
    lifecycle: IN_FORCE,
    amendments: [],
  };
}
