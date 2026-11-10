import type { CartAdjustment, CustomerAudience, PickupAddressView } from "@lfd/contracts";

import type { OrderCompanyStatus } from "../../domain/ports/company-status.reader.js";
import type { BasketPromotionApplied } from "../../domain/services/basket-promotion-choice.js";
import type { EndedBasketPromotion } from "../../domain/services/ended-basket-promotions.js";
import type { PromotionBuyerKind } from "../../../promotions/domain/promotion-targeting.js";
import type { ServedPromotionLabel } from "../../../promotions/domain/promotion-labels.js";

/*
 * Les formes que `CartAdjustments` reçoit et rend — sorties du service pour
 * qu'il tienne sous les 300 lignes avec la promotion de livraison (L10).
 */

/**
 * **Qui commande, établi au serveur** — ce dont la remise de retrait et les
 * promotions panier (retrait comme livraison, L10) dépendent. Jamais lu d'un
 * corps de requête.
 */
export interface PickupBuyer {
  readonly audience: CustomerAudience;
  readonly companyId: string | null;
  /** Le statut que la clientèle a été tirée de — lu UNE fois, par `CustomerAudiences`. */
  readonly companyStatus: OrderCompanyStatus | null;
  /** La porte d'entrée : posée par la route (devis) ou figée sur la commande (L1). */
  readonly buyerKind: PromotionBuyerKind;
}

/** Le point de retrait retenu, et ce qu'il retire du panier. */
export interface ResolvedPickup {
  readonly point: PickupAddressView;
  readonly discountCents: number;
  readonly discountAdjustment: CartAdjustment | null;
  /**
   * Les SKU que la remise ne couvre pas — vide sans remise ou sans règle.
   * La passation en fige le drapeau sur chaque ligne (R2).
   */
  readonly ineligibleSkus: ReadonlySet<string>;
  /**
   * La promotion panier retenue sous la source `promotions` ; `null` sous
   * l'ancien chemin (la remise du site n'a pas d'identifiant de promotion).
   */
  readonly promotionId: string | null;
  /** Le libellé de cette promotion pour l'acheteur, que la commande fige (L8b) ; `null` sinon. */
  readonly discountLabel: ServedPromotionLabel | null;
  /**
   * Les remises retenues, dans l'ordre d'application (lot M7) : à partir de
   * deux, les champs ci-dessus disent le total (cf. `BasketPromotionOutcome`).
   */
  readonly applied: readonly BasketPromotionApplied[];
  /** Les remises à heures finies aujourd'hui qui auraient touché ce panier (§ 8 du plan jours et heures). */
  readonly ended: readonly EndedBasketPromotion[];
}
