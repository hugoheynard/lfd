import type { OrderQuoteCutoffView, OrderSaleUnit, VatShareView } from "./order.js";
import type { ShopItemLockedReason } from "./shop-catalogue.js";

/**
 * **Ce que la saisie de l'équipe coûterait, au centime** — la réponse de
 * `POST /admin/orders/estimate` (plan
 * `documentation/commandes/passation/commande-passee-par-l-equipe.md`, § 8).
 *
 * Le serveur compose la commande que `POST /admin/orders` passerait, avec le
 * même corps, et ne l'écrit pas : chaque montant ci-dessous est lu sur
 * l'agrégat que la passation aurait persisté. Le front n'en calcule aucun.
 */
export interface AdminOrderEstimateView {
  /** Les montants de la commande composée ; `null` quand la composition est refusée. */
  readonly amounts: AdminOrderEstimateAmountsView | null;
  /** L'heure limite du jour visé, ou `null` (sur stock, ou rien à opposer). */
  readonly cutoff: OrderQuoteCutoffView | null;
  /**
   * Le refus que la passation lèverait en composant cette commande, avec ses
   * mots ; `null` quand elle se compose.
   */
  readonly refusal: AdminOrderEstimateNotice | null;
  /**
   * Ce que la passation jugera APRÈS la composition, sous verrou — le reste
   * en vitrine, le crédit du règlement au compte —, jugé ici sans verrou :
   * « au moment du calcul », jamais une promesse.
   */
  readonly warnings: readonly AdminOrderEstimateNotice[];
}

/** Un refus ou un avertissement : le code stable, et la phrase de la passation. */
export interface AdminOrderEstimateNotice {
  readonly code: string;
  readonly message: string;
}

/**
 * Les montants, dans les unités des colonnes de la commande : HT en centimes,
 * prix unitaires en millicentimes. `vatMethod` dit l'unité des remises et du
 * port en entrée de la composition (`exact_ht` : leurs TTC sont aussi donnés).
 */
export interface AdminOrderEstimateAmountsView {
  readonly vatMethod: "line_ht" | "exact_ht";
  readonly lines: readonly AdminOrderEstimateLineView[];
  /** HT, somme des lignes arrondies. */
  readonly subtotalCents: number;
  /** HT, toutes remises de panier confondues (retrait, promotions). */
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
  /** Le détail des remises, dans l'ordre d'application. */
  readonly discounts: readonly AdminOrderEstimateDiscountView[];
  /** HT, frais de zone ; `0` en retrait. */
  readonly deliveryFeeCents: number;
  readonly deliveryFeeTtcCents: number | null;
  /** HT, supplément de retard ; `0` sans dérogation dépensée (D1 : une ligne à part). */
  readonly lateFeeCents: number;
  /** Le taux de TVA du supplément, ou `null` sans supplément. */
  readonly lateFeeVatRatePercent: number | null;
  readonly vatCents: number;
  readonly vatShares: readonly VatShareView[];
  /** Le « Total HT » du bon à venir, par `orderPretaxCents` au serveur (plan L6). */
  readonly pretaxCents: number;
  /** TTC à régler. */
  readonly totalCents: number;
}

/** Une ligne de la commande composée. */
export interface AdminOrderEstimateLineView {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: OrderSaleUnit;
  readonly vatRate: number;
  /** HT, millicentimes — le prix qui sera facturé. */
  readonly unitPriceMillicents: number;
  /**
   * HT, millicentimes — le tarif d'entrée de la résolution, avant mercuriale,
   * palier et promotion : le prix barré quand il diffère. `null` si la ligne
   * ne porte pas sa trace.
   */
  readonly basePriceMillicents: number | null;
  /** HT, centimes. */
  readonly lineTotalCents: number;
  /** TTC, centimes ; `null` pour une commande de société. */
  readonly lineTotalTtcCents: number | null;
}

/** Une remise de panier appliquée. */
export interface AdminOrderEstimateDiscountView {
  /** À partir de 1. */
  readonly rank: number;
  /** HT, positif. */
  readonly amountCents: number;
  readonly amountTtcCents: number | null;
  /** La promotion qui l'a produite ; `null` pour la remise du point de retrait. */
  readonly promotionId: string | null;
  /** Son libellé français, ou `null`. */
  readonly label: string | null;
}

/**
 * **Le prix d'un article au rayon d'un client**, tel que la saisie de l'équipe
 * le pose sur sa liste (plan
 * `documentation/commandes/passation/plan-liste-au-prix-du-client.md`, L1).
 *
 * Tiré du `ShopItemView` du rayon reconnu de ce client — le même objet, la
 * même clé, le même cache que sa boutique. Rien d'autre : ni marge, ni trace.
 */
export interface CustomerShelfPriceView {
  readonly sku: string;
  /** Le prix résolu à la quantité 1, HT, en millicentimes (`ShopItemView.unitPriceMillicents`). */
  readonly unitPriceMillicents: number;
  /**
   * Le tarif à barrer, HT, en millicentimes (`ShopItemView.catalogPriceMillicents`)
   * — `null` quand il n'y a rien à barrer.
   */
  readonly struckFromMillicents: number | null;
  /** Le même prix, TTC, en centimes (`ShopItemView.unitPriceTtcCents`) — calculé par le serveur. */
  readonly unitPriceTtcCents: number;
  /**
   * Le tarif à barrer, TTC, en centimes (`ShopItemView.catalogPriceTtcCents`)
   * — `null` exactement quand {@link struckFromMillicents} l'est.
   */
  readonly struckFromTtcCents: number | null;
  /** Pourquoi l'article ne se commande pas pour ce client ; `null` s'il se commande. */
  readonly lockedReason: ShopItemLockedReason | null;
}

/**
 * La réponse de `GET /admin/catalog/companies/:companyId/shelf-prices`. Un
 * article absent de `items` n'est pas au rayon de ce client.
 *
 * `audience` : comment la société est servie — `pro` (l'écran montre le HT)
 * ou `public` (servie au prix d'étiquette, sans rien de négocié : le TTC).
 */
export interface CustomerShelfPricesView {
  readonly items: readonly CustomerShelfPriceView[];
  readonly audience: "pro" | "public";
}
