import type {
  BillingAddressPayload,
  CartAdjustment,
  DeliveryVatMode,
  LateFeeAdjustment,
  LocalMoment,
  PickupSnapshot,
  WindowMode,
} from "@lfd/contracts";

import type { DraftOrderInput } from "../entities/order-shapes.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";
import type { OrderLineInput, OrderLineSnapshot } from "../value-objects/order-line.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { BasketDiscountRefusal, RevisableDiscount } from "./basket-discount-replay.js";
import type { LineSealing } from "./basket-promotion-choice.js";
import type { EndedBasketPromotion } from "./ended-basket-promotions.js";
import type { LoadedBasketPromotions } from "./loaded-basket-promotions.js";

/*
 * Les formes du chiffrage d'un panier — plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 2.1 à
 * § 2.3 : ce que le chargement rend (`BasketPricingContext`), ce que le calcul
 * reçoit en plus (`BasketCart`, `BasketVerdicts`) et ce qu'il rend
 * (`BasketAmounts`). Des données, sans comportement.
 */

/** Le point de retrait retenu — choisi ou présélectionné —, figé en snapshot. */
export interface PickupBasketRoute {
  readonly method: "pickup";
  readonly point: PickupSnapshot;
}

/** La zone déduite du code postal livré, son barème, et le mode créneau global. */
export interface DeliveryBasketRoute {
  readonly method: "delivery";
  readonly zoneId: string;
  readonly address: BillingAddressPayload;
  /** Le barème de la zone, figé avec le montant qu'il produit : `zone.fee` est mutable. */
  readonly fee: CartAdjustment;
  /**
   * Le franco (plan `plan-livraison-offerte.md`, 1b) : le seuil HT, en
   * centimes, que les marchandises remisées doivent atteindre pour que la
   * livraison soit offerte ; `null` = pas de franco. Celui du jour à la
   * passation, le FIGÉ en révision dans la même zone.
   */
  readonly freeDeliveryThresholdCents: number | null;
  /** Le mode créneau / échéance global (CA-D2) — l'acheminement convenu le lit. */
  readonly globalWindowMode: WindowMode;
}

export type BasketRoute = PickupBasketRoute | DeliveryBasketRoute;

/**
 * Ce que le CALCUL lit d'un acheminement : la méthode, et le barème de la
 * zone en coursier. Le devis de la boutique ne connaît du coursier que le
 * code postal (É4) : l'adresse et le point figé sont l'affaire de la
 * commande, pas du prix.
 */
export type PricedRoute =
  | Pick<PickupBasketRoute, "method">
  | Pick<DeliveryBasketRoute, "method" | "zoneId" | "fee" | "freeDeliveryThresholdCents">;

/** La commande qu'on révise : ses lignes figées et ses remises, REJOUÉES (§ 10.2 des remises acquises). */
export interface ReplayedFrom {
  readonly lines: readonly OrderLineSnapshot[];
  readonly discounts: readonly RevisableDiscount[];
}

/**
 * **Tout ce que le calcul consomme, chargé une fois** (§ 2.1). Aucun champ
 * n'attend un montant : c'est ce qui permet de le charger avant de calculer.
 */
export interface BasketPricingContext {
  /** Les lignes tarifées — en révision, les gardées à leur prix figé (R3) et les neuves. */
  readonly lines: readonly OrderLineInput[];
  /** La mercuriale qui fixe chaque ligne tarifée, par SKU ; absent = aucune. */
  readonly sealing: ReadonlyMap<string, LineSealing>;
  /** Le rangement de chaque SKU au catalogue, lu une fois et TOUJOURS classé (É2). */
  readonly known: ReadonlyMap<string, OrderLineClassification>;
  readonly route: BasketRoute;
  readonly promotions: LoadedBasketPromotions;
  /** `null` à la passation ; la commande qu'on révise sinon. */
  readonly replayed: ReplayedFrom | null;
  /** Le mode de TVA du port : celui du jour pour un panier, le figé pour une révision (É9). */
  readonly deliveryVatMode: DeliveryVatMode;
}

/**
 * **Le panier partiel** (§ 2.5) : ce que le devis chiffre avant que
 * l'acheminement soit choisi. Sans acheminement, ni point ni zone, donc
 * aucune promotion panier à lire — jamais un acheminement inventé.
 * `BasketPricingContext` (le panier de la commande) en est un cas.
 */
export type PartialBasketPricingContext = Omit<BasketPricingContext, "route" | "promotions"> &
  PartialBasketRouting;

/** L'acheminement et ses promotions, ou ni l'un ni l'autre. */
export type PartialBasketRouting =
  | { readonly route: PricedRoute; readonly promotions: LoadedBasketPromotions }
  | { readonly route: null; readonly promotions: null };

/** Ce que le calcul tient du panier lui-même, hors chargement. */
export interface BasketCart {
  /** Décidée par l'agrégat (`placementVatMethodOf`), relue sur la commande en révision. */
  readonly vatMethod: OrderVatMethod;
  /** Le créneau choisi, que juge une promotion « au retrait » ; `null` sans créneau. */
  readonly handoverAt: LocalMoment | null;
}

/**
 * **Les verdicts qui ont un prix** (§ 2.3) : jugés ailleurs, reçus ici. La
 * surtaxe de retard n'existe que si une dérogation a laissé passer (passation),
 * ou telle que la commande l'a figée (révision, R4).
 */
export interface BasketVerdicts {
  readonly lateFee: LateFeeAdjustment | null;
}

/**
 * Ce qu'un chiffrage partiel attend encore pour être le prix de la commande
 * (§ 2.5, É3, É6) : l'acheminement (ni remise ni frais sans lui), le créneau
 * (une promotion « au créneau » n'a pas pu être jugée). La surtaxe de retard
 * n'est pas chiffrée au devis (É11, laissé ouvert le 2026-11-03).
 */
export type BasketAwaiting = "fulfillment" | "window";

/** La part de `DraftOrderInput` que le chiffrage décide — l'argent, dans l'unité de la méthode. */
export type BasketTerms = Pick<
  DraftOrderInput,
  | "lines"
  | "discountCents"
  | "discountAdjustment"
  | "discountLabel"
  | "discountPromotionId"
  | "discountTerms"
  | "basketDiscounts"
  | "deliveryFeeCents"
  | "deliveryFeeAdjustment"
  | "freeDelivery"
  | "deliveryVatMode"
  | "lateFeeCents"
  | "lateFeeAdjustment"
>;

/**
 * Ce que `priceBasket` rend. ⚠️ Pas la TVA ni le TTC : l'agrégat les calcule
 * par `AMOUNTS_BY_METHOD` APRÈS ses gardes, pour que l'ordre des refus ne
 * bouge pas ; le devis appelle la même fonction (`draftedAmountsOf`, L2).
 */
export interface BasketAmounts {
  readonly terms: BasketTerms;
  /** Le sous-total HT, arrondi au centime par ligne comme la ligne persistée. */
  readonly subtotalCents: number;
  /** Les remises rejouées qu'une révision ferait perdre (§ 10.4) ; vide à la passation. */
  readonly refusals: readonly BasketDiscountRefusal[];
  /** Les promotions cumulables écartées au-delà de cinq, que l'équipe doit apprendre. */
  readonly beyondCap: readonly string[] | undefined;
  /** Les remises à heures finies aujourd'hui qui auraient touché ce panier (É7). */
  readonly ended: readonly EndedBasketPromotion[];
  /** Vide : ce chiffrage est le prix de la commande. Sinon, ce qui manque (§ 2.5). */
  readonly awaiting: readonly BasketAwaiting[];
}
