import type {
  CartAdjustment,
  DeliveryVatMode,
  LateFeeAdjustment,
  LocalMoment,
} from "@lfd/contracts";

import {
  ASKED_AT,
  livePromotion,
} from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import type { PromotionFulfillment } from "../../../../promotions/domain/promotion-fulfillment.js";
import { PREVIEWED_FACTS } from "../../../../promotions/domain/promotion-targeting.js";
import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import { replayableDiscountsOf } from "../../services/basket-discount-replay.js";
import type {
  BasketPricingContext,
  BasketRoute,
  ReplayedFrom,
} from "../../services/basket-pricing-context.js";
import type { LineSealing } from "../../services/basket-promotion-choice.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import type { PricedDraftInput } from "../order-priced-draft.js";
import type { RevisableOrder } from "../../../revision/domain/entities/order-revision.js";
import type { OrderFulfillmentInput } from "../order-shapes.js";

/**
 * **Une commande de test se compose sur un panier** (L7, 2a, 2026-11-04) :
 * `Order.draft`, `recompose` et `revise` ne reçoivent plus de montants. Ces
 * fabriques construisent le panier chargé que `PricingContext` rendrait — les
 * lignes, l'acheminement tiré de l'identité, les promotions vivantes — et
 * l'agrégat le chiffre lui-même par `priceBasket`. Une donnée de test que le
 * domaine ne peut pas produire ne prouverait rien (CLAUDE.md § 5).
 *
 * L'instant est celui des fixtures de promotions (`ASKED_AT`), comparé à
 * leurs seules fenêtres : `priceBasket` ne lit aucune horloge.
 */

/** L'identité d'une commande — tout `PricedDraftInput` sauf ce qui se chiffre. */
export type OrderIdentity = Omit<PricedDraftInput, "pricing">;

/** Le panier, ce qui en décide le prix. Seules les lignes sont obligatoires. */
export interface BasketSpec {
  readonly lines: readonly OrderLineInput[];
  readonly promotions?: readonly LivePromotion[] | undefined;
  /** Le barème de la zone, en coursier ; défaut : aucun frais (`amount` 0). */
  readonly deliveryFee?: CartAdjustment | undefined;
  readonly deliveryVatMode?: DeliveryVatMode | undefined;
  readonly lateFee?: LateFeeAdjustment | null | undefined;
  readonly known?: ReadonlyMap<string, OrderLineClassification> | undefined;
  readonly sealing?: ReadonlyMap<string, LineSealing> | undefined;
  readonly replayed?: ReplayedFrom | null | undefined;
  readonly handoverAt?: LocalMoment | null | undefined;
  /** Le seuil du franco de la zone (1b) ; absent = aucun. */
  readonly freeDeliveryThresholdCents?: number | null | undefined;
}

/** Le barème « aucun frais » d'une zone : la course est offerte. */
export const FREE_ZONE: CartAdjustment = { mode: "amount", cents: 0 };

/** L'acheminement du panier, lu sur celui de la commande. */
export function routeOf(
  fulfillment: OrderFulfillmentInput,
  fee: CartAdjustment,
  freeDeliveryThresholdCents: number | null = null,
): BasketRoute {
  if (fulfillment.method === "pickup") {
    const point = fulfillment.pickupAddress ?? {
      label: "",
      ligne1: "",
      ligne2: "",
      codePostal: "",
      ville: "",
      pays: "",
    };
    return { method: "pickup", point };
  }
  return {
    method: "delivery",
    zoneId: fulfillment.deliveryZoneId ?? "",
    address: fulfillment.deliveryAddress ?? {
      label: "",
      ligne1: "",
      ligne2: "",
      codePostal: "",
      ville: "",
      pays: "",
    },
    fee,
    freeDeliveryThresholdCents,
    globalWindowMode: "slot",
  };
}

/** Le panier chargé de cette commande. */
export function basketOf(identity: OrderIdentity, basket: BasketSpec): BasketPricingContext {
  const route = routeOf(
    identity.fulfillment,
    basket.deliveryFee ?? FREE_ZONE,
    basket.freeDeliveryThresholdCents ?? null,
  );
  return {
    lines: basket.lines,
    sealing: basket.sealing ?? new Map(),
    known: basket.known ?? new Map(),
    route,
    promotions: {
      at: ASKED_AT,
      live: basket.promotions ?? [],
      facts: {
        ...PREVIEWED_FACTS,
        companyId: identity.companyId,
        fulfillment:
          route.method === "pickup"
            ? { method: "pickup", pickupId: route.point.siteId ?? null }
            : { method: "delivery", zoneId: route.zoneId },
      },
    },
    replayed: basket.replayed ?? null,
    deliveryVatMode: basket.deliveryVatMode ?? "standard",
  };
}

/** L'entrée de `Order.draft` / `recompose` : l'identité, et le panier à chiffrer. */
export function pricedInput(identity: OrderIdentity, basket: BasketSpec): PricedDraftInput {
  return {
    ...identity,
    pricing: {
      context: basketOf(identity, basket),
      handoverAt: basket.handoverAt ?? null,
      verdicts: { lateFee: basket.lateFee ?? null },
    },
  };
}

/** Ce qu'une révision rejoue de la commande — la forme que `OrderRevising` charge. */
export function replayedOf(current: RevisableOrder): ReplayedFrom {
  return { lines: current.lines, discounts: replayableDiscountsOf(current) };
}

/** Ce qu'une suite règle d'une promotion panier : identité, libellé, SKU exclus. */
export interface PromotionOver {
  readonly id?: string;
  readonly label?: string;
  /** Le libellé dans les trois langues ; prime sur `label`. */
  readonly labels?: { readonly fr: string; readonly en: string; readonly it: string };
  readonly excludedSkus?: readonly string[];
  readonly cumulative?: boolean;
}

/**
 * Une promotion panier « au retrait », tous points, tout le monde : la seule
 * façon, depuis le modèle des promotions, qu'une commande porte une remise.
 */
export function pickupPromotion(
  adjustment: CartAdjustment,
  over: PromotionOver & { readonly points?: readonly string[] } = {},
): LivePromotion {
  return basketPromotion(
    adjustment,
    {
      kind: "basket",
      pickup: over.points === undefined ? "all" : { points: over.points },
      delivery: "none",
    },
    over,
  );
}

/** Une promotion panier « en livraison », toutes zones. */
export function deliveryPromotion(
  adjustment: CartAdjustment,
  over: PromotionOver = {},
): LivePromotion {
  return basketPromotion(adjustment, { kind: "basket", pickup: "none", delivery: "all" }, over);
}

function basketPromotion(
  adjustment: CartAdjustment,
  fulfillment: PromotionFulfillment,
  over: PromotionOver,
): LivePromotion {
  const promotion = livePromotion({
    scope: {
      mode: "all_except",
      rules: (over.excludedSkus ?? []).map((sku) => ({
        target: "variant",
        targetId: sku,
        eligible: false,
        targetRank: null,
      })),
    },
    ...(over.cumulative === undefined ? {} : { cumulative: over.cumulative }),
    id: over.id ?? "promo_panier",
    label: over.label ?? "Remise panier",
    effect:
      adjustment.mode === "percent"
        ? { kind: "percent_off", basisPoints: adjustment.bp }
        : { kind: "basket_amount_off", cents: adjustment.cents },
    fulfillment,
  });
  return over.labels === undefined ? promotion : { ...promotion, label: over.labels };
}

/** Une identité et un panier, dits ensemble — la forme des fabriques des suites. */
export type DraftSpec = OrderIdentity & BasketSpec;

/**
 * La commande `base`, modifiée par `over`, en entrée chiffrée : les suites
 * gardent leur `draftInput({ … })` d'avant, les montants en moins.
 */
export function draftFrom(base: DraftSpec, over: Partial<DraftSpec> = {}): PricedDraftInput {
  const {
    lines,
    promotions,
    deliveryFee,
    deliveryVatMode,
    lateFee,
    known,
    sealing,
    replayed,
    handoverAt,
    freeDeliveryThresholdCents,
    ...identity
  } = { ...base, ...over };
  return pricedInput(identity, {
    lines,
    promotions,
    deliveryFee,
    deliveryVatMode,
    lateFee,
    known,
    sealing,
    replayed,
    handoverAt,
    freeDeliveryThresholdCents,
  });
}
