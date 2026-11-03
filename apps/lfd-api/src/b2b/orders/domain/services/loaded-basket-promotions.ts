import type { LocalMoment } from "@lfd/contracts";

import {
  promotionsAdmitted,
  type LivePromotion,
} from "../../../promotions/domain/live-promotion.js";
import type { PromotionAudienceFacts } from "../../../promotions/domain/promotion-targeting.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";
import {
  chooseBasketPromotion,
  type BasketLine,
  type BasketPromotionOutcome,
} from "./basket-promotion-choice.js";

/**
 * **Ce que la caisse a LU pour choisir une promotion panier** — l'instant de
 * la question, les promotions vivantes et les faits de l'acheteur (plan
 * `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`, § 2.1).
 *
 * Séparé du choix pour que le choix soit un calcul : rien ici n'attend un
 * montant, et le même chargement sert à tous les paniers qu'on chiffrerait
 * pour le même acheteur et le même acheminement.
 */
export interface LoadedBasketPromotions {
  /** Le « maintenant » de la requête, lu une fois au `Clock` (CLAUDE.md § 3.2). */
  readonly at: Date;
  readonly live: readonly LivePromotion[];
  readonly facts: PromotionAudienceFacts;
}

/**
 * La promotion panier de ce panier, à partir de ce qui a été chargé — la
 * règle même de `BasketPromotions.resolve`, qui l'appelle aussi : une
 * seconde sélection des candidates finirait par en admettre d'autres.
 *
 * `handoverAt` : le créneau choisi, que juge une promotion « au retrait » ;
 * `null` sans créneau (`plan-jours-et-heures.md`, § 8.3).
 */
export function chooseLoadedBasketPromotion(
  loaded: LoadedBasketPromotions,
  lines: readonly BasketLine[],
  known: ReadonlyMap<string, OrderLineClassification>,
  handoverAt: LocalMoment | null,
): BasketPromotionOutcome {
  const candidates = promotionsAdmitted(loaded.live, loaded.at, loaded.facts, handoverAt);
  return chooseBasketPromotion(candidates, lines, known);
}
