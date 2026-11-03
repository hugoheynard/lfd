import type {
  CustomerAudience,
  DeliveryVatMode,
  PickupAddressView,
  PickupSnapshot,
} from "@lfd/contracts";

import { AppError } from "../../../../platform/shared/errors/app-error.js";
import {
  InvalidOrderFulfillmentError,
  PickupClosedAtRequestedTimeError,
} from "../../domain/errors/order-errors.js";
import type { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import type { OrderLineClassificationReader } from "../../domain/ports/order-line-classification.reader.js";
import { windowFitsPickup } from "../../domain/services/agreed-fulfillment.js";
import type {
  BasketPricingContext,
  BasketRoute,
} from "../../domain/services/basket-pricing-context.js";
import type { KeptLineRefusal } from "../../domain/services/kept-line-prices.js";
import type { OrderVatMethod } from "../../domain/value-objects/order-vat-method.js";
import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";
import type { CartAdjustments, PickupBuyer } from "./cart-adjustments.service.js";
import type { CustomerAudiences } from "./customer-audiences.service.js";
import type { OrderContent } from "./order-content.js";
import type { OrderLinePricing } from "./order-line-pricing.service.js";
import type { OrderParties } from "./order-parties.js";
import {
  priceRevisedLines,
  sealingBySku,
  type RevisedFrom,
  type RevisedLines,
} from "./revised-line-pricing.js";

/** Le panier chargé, et ce que le chargement sait de plus que le calcul. */
export interface LoadedBasket {
  readonly context: BasketPricingContext;
  /** La clientèle, lue une fois : elle désigne les CGV que la commande porte. */
  readonly audience: CustomerAudience;
  /** Les prix gardés qu'une révision changerait (§ 10.4 des remises acquises) ; vide à la passation. */
  readonly keptRefusals: readonly KeptLineRefusal[];
}

/**
 * Le chargement : un panier chargé, ou le premier refus de lecture, rendu en
 * DONNÉE (§ 2.1). Le chargement s'arrête au premier — il n'a plus de quoi
 * lire la suite —, et c'est à l'appelant de le lever à son rang (§ 2.4).
 */
export type LoadedPricing =
  | { readonly refusals: readonly []; readonly loaded: LoadedBasket }
  | { readonly refusals: readonly [AppError]; readonly loaded: null };

/** Ce que le chargement reçoit de l'appelant. */
export interface PricingRequest {
  readonly content: OrderContent;
  readonly parties: OrderParties;
  /** La commande qu'on révise, ou `null` à la passation. */
  readonly revised: RevisedFrom | null;
  /** L'étiquette de la sonde de coût (`pricing-caller.ts`) ; sans effet en révision. */
  readonly caller: PricingCaller;
  readonly vatMethod: OrderVatMethod;
  /** Le mode de TVA du port figé sur la commande qu'on révise (É9) ; `null` sinon. */
  readonly frozenDeliveryVatMode: DeliveryVatMode | null;
  /**
   * La clientèle figée sur la commande qu'on révise (É13, Hugo, 2026-11-03) ;
   * `null` à la passation, qui la lit au statut de la société d'aujourd'hui.
   */
  readonly frozenAudience: CustomerAudience | null;
}

/**
 * **Charger une fois ce que le chiffrage d'un panier consomme** (plan
 * `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`, § 2.1,
 * lot L1a) : les prix de ligne, le classement des articles, la clientèle,
 * le point ou la zone, les promotions et les faits de l'acheteur, le mode de
 * TVA du port. Rien ici ne calcule un montant : c'est `priceBasket`.
 *
 * Les lectures se font dans l'ordre exact où la composition les faisait —
 * le golden master compare les codes de refus ET leur ordre.
 *
 * 🔴 **Jamais d'instant passé à la porte du prix** : elle dit « maintenant »
 * par l'absence d'instant, et un instant explicite y déclenche la lecture
 * datée qui a fait payer le prix pro à un invité le 2026-10-30. L'unicité du
 * « maintenant » est celle du contexte de requête (CLAUDE.md § 3.2).
 */
export class PricingContext {
  constructor(
    private readonly linePricing: OrderLinePricing,
    private readonly adjustments: CartAdjustments,
    private readonly classifications: OrderLineClassificationReader,
    private readonly audiences: CustomerAudiences,
    private readonly deliveryVat: OrderDeliveryVatReader,
  ) {}

  /** Charge le panier ; un refus de lecture arrête le chargement et revient en donnée. */
  async load(request: PricingRequest): Promise<LoadedPricing> {
    const lines = await refusalOrValue(() => this.priceLines(request));
    if ("refusal" in lines) {
      return refused(lines.refusal);
    }
    const priced = lines.value;
    // Produit et famille, lus UNE fois et figés sur chaque ligne : ce qui dira
    // demain pourquoi une ligne était exclue de la remise (plan des exclusions).
    const known = await this.classifications.classify(priced.lines.map((line) => line.sku));
    // La clientèle, lue UNE fois, avec le statut d'où elle est tirée : les
    // promotions panier le lisent (plan des promotions, L5). En révision, la
    // clientèle est celle de la COMMANDE (É13, Hugo, 2026-11-03) : un point
    // ou une livraison ouverts aux pros le restent pour une commande pro,
    // même si la société a changé de statut depuis.
    const standing = await this.audiences.standingOf(request.parties.companyId);
    const audience = request.frozenAudience ?? standing.audience;
    const { companyStatus } = standing;
    const buyer: PickupBuyer = {
      audience,
      companyId: request.parties.companyId,
      companyStatus,
      buyerKind: request.parties.buyerKind,
    };
    const routed = await this.routeOf(request.content, buyer);
    if ("refusal" in routed) {
      return refused(routed.refusal);
    }
    // Lu sur TOUTE passation, retrait compris : le mode se fige sur la commande
    // (V3) ; une révision garde le sien (É9).
    const currentVatMode = await this.deliveryVat.current();
    return {
      refusals: [],
      loaded: {
        context: {
          lines: priced.lines,
          sealing: priced.sealing,
          known,
          route: routed.value.route,
          promotions: routed.value.promotions,
          replayed: request.revised,
          deliveryVatMode: request.frozenDeliveryVatMode ?? currentVatMode,
        },
        audience,
        keptRefusals: priced.refusals,
      },
    };
  }

  /**
   * Les lignes tarifées. À la passation, toutes passent par la résolution qui
   * facture ; en révision, {@link priceRevisedLines} — les lignes gardées à
   * leur prix figé, retarifées pour être comparées quand leur quantité change.
   */
  private async priceLines(request: PricingRequest): Promise<RevisedLines> {
    const { content, parties, revised } = request;
    if (revised === null) {
      const resolved = await this.linePricing.resolve(content.lines, parties, request.caller);
      return {
        lines: resolved.map((entry) => entry.line),
        refusals: [],
        sealing: sealingBySku(resolved),
      };
    }
    return priceRevisedLines(this.linePricing, content.lines, parties, revised, request.vatMethod);
  }

  /**
   * Le point ou la zone, et les promotions de cet acheminement. **Retrait** :
   * le point choisi ou présélectionné, puis la tranche contre ses fenêtres.
   * **Coursier** : la zone déduite du code postal livré.
   */
  private async routeOf(
    content: OrderContent,
    buyer: PickupBuyer,
  ): Promise<Attempt<Pick<BasketPricingContext, "route" | "promotions">>> {
    if (content.fulfillmentMethod === "pickup") {
      return this.pickupRouteOf(content, buyer);
    }
    // Coursier — le schéma garantit l'adresse ; on garde une défense typée.
    const address = content.deliveryAddress;
    if (address === null) {
      return {
        refusal: new InvalidOrderFulfillmentError("Adresse de livraison requise en coursier."),
      };
    }
    const delivery = await refusalOrValue(() =>
      this.adjustments.deliveryRoute(address.codePostal, buyer.audience),
    );
    if ("refusal" in delivery) {
      return delivery;
    }
    const { zone, globalWindowMode } = delivery.value;
    // La zone des frais entre dans le fait (`promotions.md`, § 2.14).
    const promotions = await this.adjustments.promotionsFor({
      ...factsOf(buyer),
      fulfillment: { method: "delivery", zoneId: zone.id },
    });
    const route: BasketRoute = {
      method: "delivery",
      zoneId: zone.id,
      address,
      fee: zone.fee,
      globalWindowMode,
    };
    return { value: { route, promotions } };
  }

  private async pickupRouteOf(
    content: OrderContent,
    buyer: PickupBuyer,
  ): Promise<Attempt<Pick<BasketPricingContext, "route" | "promotions">>> {
    const point = await refusalOrValue(() =>
      this.adjustments.pickupPoint(content.pickupAddressId, buyer.audience, buyer.companyId),
    );
    if ("refusal" in point) {
      return point;
    }
    const promotions = await this.adjustments.promotionsFor({
      ...factsOf(buyer),
      // Le point RETENU — choisi ou présélectionné (§ 13.6).
      fulfillment: { method: "pickup", pickupId: point.value.id },
    });
    // La tranche doit tenir dans l'UNE des fenêtres du point — jamais dans
    // leur union : entre le créneau pro et l'ouverture publique il peut y
    // avoir porte close.
    if (!windowFitsPickup(content.requestedWindow ?? null, point.value.opening)) {
      return { refusal: new PickupClosedAtRequestedTimeError() };
    }
    return { value: { route: { method: "pickup", point: toSnapshot(point.value) }, promotions } };
  }
}

/** Une lecture qui a rendu sa valeur, ou un refus. */
type Attempt<T> = { readonly value: T } | { readonly refusal: AppError };

/**
 * Lit, et rend un refus métier en DONNÉE au lieu de le lever. Une panne
 * technique, elle, n'est pas un refus : elle remonte telle quelle.
 */
async function refusalOrValue<T>(read: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { value: await read() };
  } catch (error) {
    if (error instanceof AppError && error.category !== "technical") {
      return { refusal: error };
    }
    throw error;
  }
}

function refused(refusal: AppError): LoadedPricing {
  return { refusals: [refusal], loaded: null };
}

/** Les faits que les promotions panier lisent de l'acheteur, l'acheminement à part. */
function factsOf(buyer: PickupBuyer): Omit<PickupBuyer, "audience"> {
  return {
    companyId: buyer.companyId,
    companyStatus: buyer.companyStatus,
    buyerKind: buyer.buyerKind,
  };
}

/**
 * Le point de retrait résolu, réduit à ses champs postaux — et à l'id du site
 * qui remet (lot S2). L'id est celui du point RÉSOLU.
 */
function toSnapshot(point: PickupAddressView): PickupSnapshot {
  return {
    siteId: point.id,
    label: point.label,
    ligne1: point.ligne1,
    ligne2: point.ligne2,
    codePostal: point.codePostal,
    ville: point.ville,
    pays: point.pays,
  };
}

/**
 * **Le panier chargé, ou le refus levé** — au rang où l'appelant l'appelle
 * (§ 2.4, étape 4).
 *
 * @throws {AppError} le premier refus de lecture : SKU inconnu, article
 * réservé, unité ou minimum, point ou livraison fermé à la clientèle, tranche
 * hors des fenêtres du point.
 */
export function loadedOrRefused(pricing: LoadedPricing): LoadedBasket {
  if (pricing.loaded === null) {
    throw pricing.refusals[0];
  }
  return pricing.loaded;
}
