import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { DeliveryReach, PickupReach } from "../../promotions/domain/promotion-fulfillment.js";
import type {
  FrozenDiscountTerms,
  FrozenTermsOrigin,
} from "../domain/services/frozen-discount-terms.js";

/**
 * **Les termes figés d'une remise, ligne ↔ domaine** — colonnes de
 * `20261031210000_les_remises_acquises` (plan
 * `documentation/promotions/plan-remises-acquises.md`, § 10.3). Partagé par la
 * passation, la révision et la reprise : deux traductions des mêmes colonnes
 * finiraient par figer deux choses.
 */

/** Les colonnes, telles que Prisma les écrit et les rend. */
export interface FrozenTermsColumns {
  readonly cumulative: boolean | null;
  readonly minQuantity: number | null;
  readonly fulfillmentPickup: string | null;
  readonly fulfillmentDelivery: string | null;
  readonly fulfillmentPickupPoints: readonly string[];
  readonly fulfillmentDeliveryZones: readonly string[];
  readonly frozenTermsOrigin: string | null;
}

export const FROZEN_TERMS_SELECT = {
  cumulative: true,
  minQuantity: true,
  fulfillmentPickup: true,
  fulfillmentDelivery: true,
  fulfillmentPickupPoints: true,
  fulfillmentDeliveryZones: true,
  frozenTermsOrigin: true,
} as const;

const UNKNOWN_TERMS = {
  cumulative: null,
  minQuantity: null,
  fulfillmentPickup: null,
  fulfillmentDelivery: null,
  fulfillmentPickupPoints: [],
  fulfillmentDeliveryZones: [],
  frozenTermsOrigin: null,
} as const;

/** Les termes à écrire ; `null` = inconnus, toutes les colonnes à `NULL` (CHECK). */
export function frozenTermsData(terms: FrozenDiscountTerms | null): {
  readonly cumulative: boolean | null;
  readonly minQuantity: number | null;
  readonly fulfillmentPickup: string | null;
  readonly fulfillmentDelivery: string | null;
  readonly fulfillmentPickupPoints: string[];
  readonly fulfillmentDeliveryZones: string[];
  readonly frozenTermsOrigin: string | null;
} {
  if (terms === null) {
    return { ...UNKNOWN_TERMS, fulfillmentPickupPoints: [], fulfillmentDeliveryZones: [] };
  }
  return {
    cumulative: terms.cumulative,
    minQuantity: terms.minQuantity,
    fulfillmentPickup: typeof terms.pickup === "object" ? "listed" : terms.pickup,
    fulfillmentDelivery: typeof terms.delivery === "object" ? "listed" : terms.delivery,
    fulfillmentPickupPoints: typeof terms.pickup === "object" ? [...terms.pickup.points] : [],
    fulfillmentDeliveryZones: typeof terms.delivery === "object" ? [...terms.delivery.zones] : [],
    frozenTermsOrigin: terms.origin,
  };
}

/** Des termes figés que le domaine ne sait pas relire : la révision n'invente rien. */
class FrozenTermsUnreadableError extends TechnicalError {
  constructor(discountId: string, what: string) {
    super(
      "orders.discounts.frozen_terms_unreadable",
      `Les conditions figées de la remise ${discountId} sont illisibles (${what}) : ` +
        "la commande ne peut pas être recomposée. Prévenir l'équipe technique.",
    );
  }
}

/**
 * Les termes relus ; `null` quand la remise n'en a pas (« inconnus »).
 *
 * @throws {FrozenTermsUnreadableError} une valeur que les CHECK auraient dû refuser.
 */
export function frozenTermsOf(
  discountId: string,
  row: FrozenTermsColumns,
): FrozenDiscountTerms | null {
  if (row.frozenTermsOrigin === null) {
    return null;
  }
  if (row.cumulative === null) {
    throw new FrozenTermsUnreadableError(discountId, "cumulable absent");
  }
  return {
    cumulative: row.cumulative,
    minQuantity: row.minQuantity,
    pickup: pickupOf(discountId, row.fulfillmentPickup, row.fulfillmentPickupPoints),
    delivery: deliveryOf(discountId, row.fulfillmentDelivery, row.fulfillmentDeliveryZones),
    origin: originOf(discountId, row.frozenTermsOrigin),
  };
}

function originOf(discountId: string, value: string): FrozenTermsOrigin {
  if (value === "placed" || value === "backfilled") {
    return value;
  }
  throw new FrozenTermsUnreadableError(discountId, `origine « ${value} »`);
}

function pickupOf(discountId: string, mode: string | null, ids: readonly string[]): PickupReach {
  const reach = reachOf(discountId, mode);
  return reach === "listed" ? { points: [...ids] } : reach;
}

function deliveryOf(
  discountId: string,
  mode: string | null,
  ids: readonly string[],
): DeliveryReach {
  const reach = reachOf(discountId, mode);
  return reach === "listed" ? { zones: [...ids] } : reach;
}

function reachOf(discountId: string, mode: string | null): "none" | "all" | "listed" {
  if (mode === "none" || mode === "all" || mode === "listed") {
    return mode;
  }
  throw new FrozenTermsUnreadableError(discountId, `acheminement « ${String(mode)} »`);
}
