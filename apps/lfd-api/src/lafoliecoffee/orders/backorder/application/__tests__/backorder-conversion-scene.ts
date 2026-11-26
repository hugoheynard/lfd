import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type AdminBackorderConvertPayload,
  type AdminBackorderQuotePayload,
  type CatalogPricing,
  type DeliveryZoneView,
  type LateFeeAdjustment,
  type OrderCutoffView,
  type PickupAddressView,
} from "@lfd/contracts";
import { KnownInHousePayers } from "../../../../account/application/commands/__tests__/in-house-doubles.js";

import { FixedRecipients } from "../../../application/commands/__tests__/intake-doubles.js";
import { AppConfig } from "../../../../../platform/config/app-config.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  CardPayments,
  type AttachedCardPayment,
  type CardPaymentCancellation,
  type CardPaymentPreparation,
  type CardProviderSettlement,
  type RetrievedCardPayment,
} from "../../../../../payment/channels/requests/index.js";
import { CatalogViewers } from "../../../../catalog/application/catalog-viewers.service.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { PAINS } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { InMemoryServedCompanies } from "../../../../catalog/infrastructure/in-memory-served-companies.js";
import { zoneFees } from "../../../../delivery-zones/application/__tests__/delivery-zone-fee.doubles.js";
import type { WaiverAvailable } from "../../../../order-cutoffs/domain/deadline/order-deadline-verdict.js";
import {
  LateFeeSettingReader,
  OpenWaiverReader,
} from "../../../../order-cutoffs/domain/deadline/ports/deadline-sources.js";
import type { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { noLinePromotionSupply } from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { FixedCommitmentTerms } from "../../../application/commands/__tests__/commitment-doubles.js";
import { RecordingDurable } from "../../../application/commands/__tests__/durable-doubles.js";
import { FixedDeliveryVat } from "../../../application/commands/__tests__/fixed-delivery-vat.js";
import { FixedSalesTerms } from "../../../application/commands/__tests__/fixed-sales-terms.js";
import { ownPayers } from "../../../application/commands/__tests__/payer-doubles.js";
import { openPlanGate } from "../../../application/commands/__tests__/plan-doubles.js";
import { CartAdjustments } from "../../../application/services/cart-adjustments.service.js";
import { CustomerAudiences } from "../../../application/services/customer-audiences.service.js";
import { OrderCutoffNotice } from "../../../application/services/order-cutoff-notice.service.js";
import { OrderDrafting } from "../../../application/services/order-drafting.service.js";
import { OrderLinePricing } from "../../../application/services/order-line-pricing.service.js";
import { OrderOperations } from "../../../application/services/order-operations.service.js";
import {
  deliveryFeePromotions,
  pointDiscountPromotions,
} from "../../../application/services/__tests__/basket-promotions.doubles.js";
import { UnboundedNegotiatedScope } from "../../../application/services/__tests__/negotiated-scope.doubles.js";
import { deadlineOf } from "../../../application/services/__tests__/order-deadline-of.js";
import { shelfCircuitOf } from "../../../application/services/__tests__/shelf-circuit-doubles.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import { NO_DELIVERY_DEFAULTS } from "../../../domain/ports/delivery-defaults.reader.js";
import { ItemLimitOverrideRecorder } from "../../../domain/ports/item-limit-override.recorder.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import type { OrderRepository } from "../../../domain/ports/order.repository.js";
import { ConvertBackorderHandler } from "../commands/convert-backorder.handler.js";
import { QuoteBackorderHandler } from "../queries/quote-backorder.handler.js";
import { InMemoryBackorders, FixedBackorderReplays } from "./backorder-conversion-doubles.js";

/**
 * **La transformation d'un reliquat, sur la VRAIE composition** : les deux
 * handlers, `OrderDrafting` et le délai de commande réels, montés sur des
 * doubles à la main. L'horloge est avant l'heure limite de la règle générale
 * (« la veille à 18 h », 30 min de rattrapage) ; `late` la met dans le
 * rattrapage : une dérogation l'admet, et un réglage de surtaxe la
 * facturerait — sauf sous la politique du reliquat.
 *
 * Dates absolues, l'exception écrite : l'horloge est un `FixedClock`, et le
 * jour servi n'est comparé qu'à elle.
 */
export const DAY = "2026-08-12";
const BEFORE_CUTOFF = new Date("2026-08-11T15:00:00.000Z");
const IN_GRACE = new Date("2026-08-11T16:10:00.000Z");

/** Le pain du jour au catalogue : 4,00 € HT — l'origine l'avait payé 3,00 €. */
export const TODAY_PRICE_MILLICENTS = 400_000;
export const COMPANY = "co_bistrot";
export const BUYER = "usr_chef";
export const STAFF = "staff_1";
export const LATE_FEE_CENTS = 500;

const GENERAL: OrderCutoffView = {
  id: "general",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 30,
};

export const LABO: PickupAddressView = {
  id: "pickup_labo",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  discounts: { b2b: null, b2c: null },
  opening: { publicOpening: null, proPickup: null },
};

/** Le créneau demandé, en retrait comme en livraison. */
const SLOT = { start: "07:00", end: "08:00" };

/** Une zone à frais (8,00 € HT), sans franco. */
export const ZONE: DeliveryZoneView = {
  id: "zone_paris",
  label: "Paris",
  postalPrefixes: ["75002"],
  fee: { mode: "amount", cents: 800 },
};

const catalog = new InMemoryProductCatalog([
  {
    family: PAINS,
    allergens: null,
    orderTimeLimit: null,
    sku: "PAI-001",
    name: "Pain",
    unitPriceMillicents: TODAY_PRICE_MILLICENTS,
    vatRate: 5.5,
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

const pickups: PickupAddressRepository = {
  list: () => Promise.resolve([LABO]),
  resolve: () => Promise.resolve(LABO),
};

function pricer(clock: FixedClock): Pricer {
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
    clock,
    noPriceHistory,
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
}

/** La dérogation de la société, ouverte ou non. */
class Waivers extends OpenWaiverReader {
  constructor(private readonly open: boolean) {
    super();
  }
  openFor(): Promise<WaiverAvailable | null> {
    return Promise.resolve(this.open ? { id: "w_1" } : null);
  }
}

/** Le réglage de surtaxe : 5,00 € HT, ou aucun. */
class LateFees extends LateFeeSettingReader {
  constructor(private readonly set: boolean) {
    super();
  }
  current(): Promise<LateFeeAdjustment | null> {
    return Promise.resolve(
      this.set
        ? { adjustment: { mode: "amount", cents: LATE_FEE_CENTS }, vatRatePercent: 20 }
        : null,
    );
  }
}

/** L'acheteur est membre ; la société est active et règle au compte. */
class MemberGuard extends OrderGuardReader {
  readonly asked: string[] = [];
  constructor(private readonly role: OrderRole | null = "orders") {
    super();
  }
  roleOf(): Promise<OrderRole | null> {
    return Promise.resolve(this.role);
  }
  staffEntryRoleOf(userId: string): Promise<OrderRole | null> {
    this.asked.push(userId);
    return Promise.resolve(this.role);
  }
  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve("active");
  }
  settlesOnAccount(): Promise<AccountSettlementStanding> {
    return Promise.resolve("granted");
  }
  isPublicPayer(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/** La dérogation consommée, avec la commande qui l'a dépensée. */
class RecordingWaiverGate extends OrderCutoffWaiverGate {
  readonly consumed: { waiverId: string; orderId: string }[] = [];
  constructor(private readonly trace: string[]) {
    super();
  }
  consume(waiverId: string, orderId: string): Promise<void> {
    this.trace.push("consume-waiver");
    this.consumed.push({ waiverId, orderId });
    return Promise.resolve();
  }
}

class NoOverrides extends ItemLimitOverrideRecorder {
  record(): Promise<void> {
    return Promise.resolve();
  }
}

/** Au compte seulement : aucun lien n'est préparé dans ces cas. */
class NoCardPayments extends CardPayments {
  prepare(): Promise<CardPaymentPreparation> {
    return Promise.reject(new RangeError("aucun lien dans ces cas"));
  }
  attach(): Promise<AttachedCardPayment> {
    return Promise.reject(new RangeError("aucun lien dans ces cas"));
  }
  release(): Promise<void> {
    return Promise.resolve();
  }
  retrieve(): Promise<RetrievedCardPayment> {
    return Promise.reject(new RangeError("non utilisé"));
  }
  cancel(): Promise<CardPaymentCancellation> {
    return Promise.reject(new RangeError("non utilisé"));
  }
  adopt(): Promise<string> {
    return Promise.reject(new RangeError("non utilisé"));
  }
  settleFromProvider(): Promise<CardProviderSettlement> {
    return Promise.reject(new RangeError("non utilisé"));
  }
}

class NoClientRoot extends AppConfig {
  override clientBaseUrl(): string | null {
    return null;
  }
}

/** Le dépôt des commandes : il garde chaque commande écrite, sous un numéro croissant. */
function capturingOrders(placed: OrderToPlace[], trace: string[]): OrderRepository {
  const unused = (): Promise<never> => Promise.reject(new RangeError("non utilisé"));
  return {
    place: (order) => {
      trace.push("place-order");
      placed.push(order.toPersistence());
      return Promise.resolve({ id: `order_${placed.length}`, orderNumber: `ORD-${placed.length}` });
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

export interface SceneOptions {
  /** L'horloge dans le rattrapage, après l'heure limite. */
  readonly late?: boolean;
  readonly waiver?: boolean;
  readonly lateFee?: boolean;
  readonly backorders: InMemoryBackorders;
  readonly replays: FixedBackorderReplays;
  readonly role?: OrderRole | null;
  /** Les payeurs maison : la commande naît interne (aucun par défaut). */
  readonly inHouse?: KnownInHousePayers;
}

function clockOf(options: Pick<SceneOptions, "late">): FixedClock {
  return new FixedClock(options.late === true ? IN_GRACE : BEFORE_CUTOFF);
}

/** La composition réelle, à l'horloge de la scène. */
export function draftingIn(
  options: Pick<SceneOptions, "late" | "waiver" | "lateFee" | "inHouse">,
): OrderDrafting {
  const clock = clockOf(options);
  const plans = openPlanGate();
  return new OrderDrafting(
    new OrderLinePricing(
      catalog,
      pricer(clock),
      new CatalogViewers(new InMemoryServedCompanies()),
      new UnboundedNegotiatedScope(),
    ),
    new CartAdjustments(
      pickups,
      zoneFees([ZONE]),
      // Livrée au créneau, comme le retrait : l'échéance par adresse n'est pas le sujet.
      { current: () => Promise.resolve({ ...DEFAULT_DELIVERY_AVAILABILITY, windowMode: "slot" }) },
      { preferredPickupOf: () => Promise.resolve(null) },
      pointDiscountPromotions(pickups),
      deliveryFeePromotions(),
    ),
    // Le créneau de la scène est inscrit sur toute adresse livrée.
    { of: () => Promise.resolve({ ...NO_DELIVERY_DEFAULTS, slots: [SLOT] }) },
    deadlineOf({
      cutoffs: { list: () => Promise.resolve([GENERAL]) },
      catalog,
      waivers: new Waivers(options.waiver ?? false),
      lateFees: new LateFees(options.lateFee ?? false),
    }),
    clock,
    new CustomerAudiences(new MemberGuard()),
    new OrderOperations(noSaleOperations(clock.now())),
    ownPayers(options.inHouse ?? null),
    new FixedDeliveryVat(),
    plans,
    new FixedSalesTerms(),
    new FixedLineClassifications(),
    shelfCircuitOf(plans),
  );
}

/** Les deux handlers du reliquat, et tout ce qu'ils ont touché. */
export function conversionScene(options: SceneOptions) {
  const trace = options.backorders.trace;
  const placed: OrderToPlace[] = [];
  const journal = new RecordingJournal();
  const waivers = new RecordingWaiverGate(trace);
  const guard = new MemberGuard(options.role === undefined ? "orders" : options.role);
  const drafting = draftingIn(options);
  const clock = clockOf(options);
  const convert = new ConvertBackorderHandler(
    guard,
    drafting,
    capturingOrders(placed, trace),
    new NoCardPayments(),
    new RecordingPublisher(),
    new NoClientRoot(),
    waivers,
    clock,
    new DirectUnitOfWork(),
    new RecordingDurable(),
    shelfCircuitOf(openPlanGate()),
    inMemoryIntents(),
    new FixedCommitmentTerms(),
    new NoOverrides(),
    new FixedIdGenerator("ovr"),
    options.backorders,
    options.replays,
    journal,
    new FixedRecipients(),
    options.inHouse ?? new KnownInHousePayers(),
  );
  const quote = new QuoteBackorderHandler(
    guard,
    drafting,
    shelfCircuitOf(openPlanGate()),
    new OrderCutoffNotice(
      deadlineOf({ cutoffs: { list: () => Promise.resolve([GENERAL]) }, catalog }),
      clock,
    ),
    options.backorders,
    options.replays,
  );
  return { convert, quote, placed, journal, waivers, guard, trace };
}

/** Le corps de l'estimation : au compte, retrait au labo, le jour servi. */
export function quotePayload(
  over: Partial<AdminBackorderQuotePayload> = {},
): AdminBackorderQuotePayload {
  return {
    buyerUserId: BUYER,
    settlement: "account",
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: LABO.id,
    requestedDeliveryDate: DAY,
    requestedWindow: SLOT,
    note: "",
    ...over,
  };
}

/** Le corps de la transformation : celui de l'estimation, et le total vu. */
export function convertPayload(
  over: Partial<AdminBackorderConvertPayload> = {},
): AdminBackorderConvertPayload {
  const { expectedTotalCents = 0, ...body } = over;
  return { ...quotePayload(body), expectedTotalCents };
}
