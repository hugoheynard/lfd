import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type CatalogPricing,
  type CounterParticularOrderPayload,
  type PickupAddressView,
} from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  ParticularStandingReader,
  type ParticularStanding,
} from "../../../../account/domain/ports/particular-standing.reader.js";
import { CatalogViewers } from "../../../../catalog/application/catalog-viewers.service.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { PAINS } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { InMemoryServedCompanies } from "../../../../catalog/infrastructure/in-memory-served-companies.js";
import { zoneFees } from "../../../../delivery-zones/application/__tests__/delivery-zone-fee.doubles.js";
import type { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { noLinePromotionSupply } from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { CustomerCancellationDeadline } from "../../../cancellation/application/services/customer-cancellation-deadline.js";
import { FixedCancellationSettings } from "../../../cancellation/application/commands/__tests__/customer-cancellation-doubles.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import type { CompanyStatusReader } from "../../../domain/ports/company-status.reader.js";
import { NO_DELIVERY_DEFAULTS } from "../../../domain/ports/delivery-defaults.reader.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import type { OrderRepository } from "../../../domain/ports/order.repository.js";
import { CartAdjustments } from "../../services/cart-adjustments.service.js";
import { CustomerAudiences } from "../../services/customer-audiences.service.js";
import { OrderCutoffNotice } from "../../services/order-cutoff-notice.service.js";
import { OrderDrafting } from "../../services/order-drafting.service.js";
import { OrderLinePricing } from "../../services/order-line-pricing.service.js";
import { OrderOperations } from "../../services/order-operations.service.js";
import {
  deliveryFeePromotions,
  pointDiscountPromotions,
} from "../../services/__tests__/basket-promotions.doubles.js";
import { deadlineOf } from "../../services/__tests__/order-deadline-of.js";
import { shelfCircuitOf } from "../../services/__tests__/shelf-circuit-doubles.js";
import { EstimateOfferedParticularOrderHandler } from "../../queries/estimate-offered-particular-order.handler.js";
import { EstimateParticularOrderAtCounterHandler } from "../../queries/estimate-particular-order-at-counter.handler.js";
import { PlaceParticularOrderAtCounterHandler } from "../place-particular-order-at-counter.handler.js";
import { PlaceOfferedParticularOrderHandler } from "../place-offered-particular-order.handler.js";
import { FixedDeliveryVat } from "./fixed-delivery-vat.js";
import { FixedSalesTerms } from "./fixed-sales-terms.js";
import { ownPayers } from "./payer-doubles.js";
import { openPlanGate } from "./plan-doubles.js";
import { RecordingDurable } from "./durable-doubles.js";
import { UnboundedNegotiatedScope } from "../../services/__tests__/negotiated-scope.doubles.js";

/**
 * La scène de la commande d'un particulier notée au comptoir : le handler, son
 * estimation, et la VRAIE composition (`OrderDrafting`) montée sur des doubles
 * — la même mécanique que la suite de la boutique sans compte, dont elle
 * reprend les lecteurs vides.
 */

/** L'instant où les prix sont résolus — les dates ne sont comparées qu'entre elles. */
const PRICED_AT = new Date("2026-01-15T09:00:00.000Z");

/** Un croissant à 2,00 € TTC public (millicentimes), TVA nulle pour lire le total d'un coup d'œil. */
export const CROISSANT_TTC_CENTS = 200;

const catalog = new InMemoryProductCatalog([
  {
    family: PAINS,
    allergens: null,
    orderTimeLimit: null,
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: CROISSANT_TTC_CENTS * 1000,
    vatRate: 0,
  },
]);

const noPriceHistory = new (class extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
})();

const LABO_POINT: PickupAddressView = {
  id: "pickup_1",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  discounts: { b2b: null, b2c: null },
  opening: { publicOpening: null, proPickup: null },
};

const pickups: PickupAddressRepository = {
  list: () => Promise.resolve([LABO_POINT]),
  resolve: () => Promise.resolve(LABO_POINT),
};

/** Sans société, ce lecteur n'est jamais appelé : la clientèle est publique. */
const noCompanies: CompanyStatusReader = { companyStatusOf: () => Promise.resolve(null) };

function pricer(): Pricer {
  const none = (): Promise<never[]> => Promise.resolve([]);
  return new Pricer(
    new PricingMaterialsLoader(
      { listArchived: none, inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      {
        liveFor: () => Promise.resolve(null),
        liveAsOf: () => Promise.resolve(null),
        listFor: none,
        liveEverywhere: none,
      },
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      { volumesFor: () => Promise.resolve(new Map()) },
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      { liveFor: none, liveAsOf: none },
      {
        volumesFor: () => Promise.resolve(new Map<string, number>()),
        committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
      },
      noLinePromotionSupply(),
    ),
    new FixedClock(PRICED_AT),
    noPriceHistory,
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
}

/** La composition réelle. */
function drafting(): OrderDrafting {
  const plans = openPlanGate();
  return new OrderDrafting(
    new OrderLinePricing(
      catalog,
      pricer(),
      new CatalogViewers(new InMemoryServedCompanies()),
      new UnboundedNegotiatedScope(),
    ),
    new CartAdjustments(
      pickups,
      zoneFees([]),
      { current: () => Promise.resolve(DEFAULT_DELIVERY_AVAILABILITY) },
      { preferredPickupOf: () => Promise.resolve(null) },
      pointDiscountPromotions(pickups),
      deliveryFeePromotions(),
    ),
    { of: () => Promise.resolve(NO_DELIVERY_DEFAULTS) },
    deadlineOf({ cutoffs: { list: () => Promise.resolve([]) }, catalog }),
    new FixedClock(PRICED_AT),
    new CustomerAudiences(noCompanies),
    new OrderOperations(noSaleOperations(PRICED_AT)),
    ownPayers(),
    new FixedDeliveryVat(),
    plans,
    new FixedSalesTerms(),
    new FixedLineClassifications(),
    shelfCircuitOf(plans),
  );
}

/** Ce que l'annuaire dit de chaque fiche ; une fiche absente est inconnue. */
export class FixedParticularStandings extends ParticularStandingReader {
  constructor(private readonly standings: Readonly<Record<string, ParticularStanding>>) {
    super();
  }

  standingOf(userId: string): Promise<ParticularStanding> {
    return Promise.resolve(this.standings[userId] ?? "unknown");
  }
}

/** Le dépôt doublé : il garde chaque commande écrite, sous un numéro croissant. */
function capturingRepo(placed: OrderToPlace[]): OrderRepository {
  const unused = (): Promise<never> => Promise.reject(new Error("non utilisé"));
  return {
    place: (order) => {
      placed.push(order.toPersistence());
      return Promise.resolve({
        id: `order_${placed.length}`,
        orderNumber: `ORD-${placed.length}`,
      });
    },
    markPaid: () => Promise.resolve(null),
    markPaymentFailed: () => Promise.resolve(null),
    markFulfilled: unused,
    markReady: unused,
    absorbIntoPlan: unused,
    markAbandoned: unused,
    failAtClosing: unused,
  };
}

export const STAFF = "staff_counter";
export const PARTICULAR = "usr_particular";
export const MEMBER = "usr_member";
export const DISABLED = "usr_disabled";

/** Le panier par défaut : deux croissants, en retrait au labo, créneau choisi. */
export function counterPayload(
  over: Partial<CounterParticularOrderPayload> = {},
): CounterParticularOrderPayload {
  return {
    buyerUserId: PARTICULAR,
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: "pickup_1",
    requestedDeliveryDate: "2026-09-01",
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    expectedTotalCents: 2 * CROISSANT_TTC_CENTS,
    ...over,
  };
}

/** Les deux passations sans société, l'estimation, et tout ce qu'ils ont touché. */
export function counterScene() {
  const placed: OrderToPlace[] = [];
  const published = new RecordingPublisher();
  const durable = new RecordingDurable();
  const particulars = new FixedParticularStandings({
    [PARTICULAR]: "particular",
    [MEMBER]: "company_member",
    [DISABLED]: "disabled",
  });
  const composition = drafting();
  const handler = new PlaceParticularOrderAtCounterHandler(
    particulars,
    composition,
    capturingRepo(placed),
    published,
    new DirectUnitOfWork(),
    durable,
    inMemoryIntents(),
    new CustomerCancellationDeadline(new FixedCancellationSettings()),
  );
  // La commande offerte à un particulier : le même mur, la même composition.
  const offerer = new PlaceOfferedParticularOrderHandler(
    particulars,
    composition,
    capturingRepo(placed),
    published,
    new DirectUnitOfWork(),
    durable,
    inMemoryIntents(),
    new CustomerCancellationDeadline(new FixedCancellationSettings()),
  );
  const cutoffNotice = new OrderCutoffNotice(
    deadlineOf({ cutoffs: { list: () => Promise.resolve([]) }, catalog }),
    new FixedClock(PRICED_AT),
  );
  const estimator = new EstimateParticularOrderAtCounterHandler(
    particulars,
    composition,
    cutoffNotice,
  );
  const offerEstimator = new EstimateOfferedParticularOrderHandler(
    particulars,
    composition,
    cutoffNotice,
  );
  return { handler, offerer, estimator, offerEstimator, placed, published, durable };
}
