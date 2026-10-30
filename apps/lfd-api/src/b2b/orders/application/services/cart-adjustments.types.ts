import type {
  CartAdjustment,
  CustomerAudience,
  DeliveryZoneView,
  PickupAddressView,
  WindowMode,
} from "@lfd/contracts";

import type { OrderCompanyStatus } from "../../domain/ports/company-status.reader.js";
import type { BasketPromotionOutcome } from "../../domain/services/basket-promotion-choice.js";
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
}

/** La zone déduite du code postal, et ce qu'elle ajoute au panier. */
export interface ResolvedDelivery {
  readonly zone: DeliveryZoneView;
  /**
   * Le mode créneau / échéance **global**, lu avec l'ouverture dans le même
   * réglage (CA-D2). Une adresse du carnet peut le surcharger : la caisse
   * résout, ce service ne connaît pas le carnet.
   */
  readonly globalWindowMode: WindowMode;
  readonly feeCents: number;
  /**
   * **Ce qui a produit** `feeCents` — le barème de la zone, tel qu'il était.
   *
   * Rendu à côté du montant pour que la commande le FIGE, exactement comme elle
   * fige déjà celui de la remise : `zone.fee` est mutable, et un montant nu ne
   * se relit pas. Cf. `OrderView.deliveryFeeAdjustment`.
   */
  readonly feeAdjustment: CartAdjustment;
  /**
   * **La promotion de livraison** (lot L10 du plan des promotions) — la
   * forme du point panier ; {@link NO_BASKET_PROMOTION} sous l'ancien chemin,
   * où la livraison n'ouvrait droit à aucune remise.
   */
  readonly discount: BasketPromotionOutcome;
}
