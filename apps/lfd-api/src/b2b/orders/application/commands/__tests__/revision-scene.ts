import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type CatalogPricing,
  type DeliveryZoneView,
  type PickupAddressView,
} from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  PackingRevisionDesk,
  type PackingDueLine,
  type PackingRevisionOutcome,
} from "../../../../../packing/channels/commerce/index.js";
import {
  OrderRevisionDesk,
  type OrderRevisionAllowance,
  type OrderRevisionOutcome,
  type RevisedOrderLine,
  type ServiceDay,
} from "../../../../../production/channels/commerce/index.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { PAINS } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import type { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import type { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import type {
  OrderRevisionToSave,
  RevisableOrder,
  RevisionActor,
} from "../../../domain/entities/order-revision.js";
import {
  AccountOrderEngagementReader,
  type AccountEngagement,
} from "../../../domain/ports/account-order-engagement.js";
import { AccountOrderRevaluation } from "../../../domain/ports/account-order-revaluation.js";
import { NO_DELIVERY_DEFAULTS } from "../../../domain/ports/delivery-defaults.reader.js";
import { OrderAccessReader } from "../../../domain/ports/order-access.reader.js";
import type { OrderRole } from "../../../domain/ports/order-guard.reader.js";
import { OrderRevisionRepository } from "../../../domain/ports/order-revision.repository.js";
import { RevisableOrderReader } from "../../../domain/ports/revisable-order.reader.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { CancellationRule } from "../../services/cancellation-rule.js";
import { CartAdjustments } from "../../services/cart-adjustments.service.js";
import { CustomerAudiences } from "../../services/customer-audiences.service.js";
import { OrderComposition } from "../../services/order-composition.service.js";
import type { OrderContent } from "../../services/order-content.js";
import { OrderCutoffGate } from "../../services/order-cutoff-gate.service.js";
import { OrderLinePricing } from "../../services/order-line-pricing.service.js";
import { OrderOperations } from "../../services/order-operations.service.js";
import type { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { OrderRevising } from "../../services/order-revising.service.js";
import { OrderWorkshopRevision } from "../../services/order-workshop-revision.js";
import { RevisionWall } from "../../services/revision-wall.js";
import { ReviseOrderHandler } from "../revise-order.handler.js";
import { RecordingDeliveryNoteFollowing } from "./delivery-note-following-double.js";
import { RecordingDurable } from "./durable-doubles.js";
import { openPlanGate } from "./plan-doubles.js";
import { FixedDeliveryVat } from "./fixed-delivery-vat.js";
import type { OrderIntake } from "../../services/order-intake.service.js";
import { intakeAt } from "./intake-doubles.js";

/**
 * **La scène de la modification d'une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) — la
 * recomposition RÉELLE (`OrderRevising` sur `OrderComposition`), montée sur
 * des doubles écrits à la main en héritant des ports, et un `trace` partagé
 * pour éprouver l'ordre des gestes.
 *
 * Les dates sont des dates absolues comparées à l'horloge FIXE de la scène,
 * jamais au mur (exception étroite du CLAUDE.md §5).
 */

/** L'horloge de la scène : la veille du jour de service, à midi (Paris). */
export const NOW = new Date("2026-11-09T11:00:00.000Z");
/** L'heure limite d'article (la veille, 18 h) est passée à cet instant. */
export const AFTER_CUTOFF = new Date("2026-11-09T19:00:00.000Z");
export const DAY = "2026-11-10";
export const NEXT_DAY = "2026-11-11";

/** 2,00 € HT le croissant, 3,50 € le pain — limite d'article la veille à 18 h. */
export const CATALOG: readonly UnsealedCatalogItem[] = [
  {
    family: PAINS,
    allergens: null,
    orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 },
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 200_000,
    vatRate: 5.5,
  },
  {
    family: PAINS,
    allergens: null,
    orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 },
    sku: "PAI-001",
    name: "Pain",
    unitPriceMillicents: 350_000,
    vatRate: 5.5,
  },
];

export const LABO_POINT: PickupAddressView = {
  id: "pickup_1",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
  // 10 % de remise de retrait pour les pros, sur tout le panier.
  discounts: {
    b2b: {
      adjustment: { mode: "percent", bp: 1_000 },
      scope: "all_except",
      categories: [],
      products: [],
    },
    b2c: null,
  },
  opening: { publicOpening: null, proPickup: null },
};

/** Une zone à 5 € forfaitaires, pour le passage en livraison. */
export const ZONE: DeliveryZoneView = {
  id: "zone_1",
  label: "Val d'Isère",
  postalPrefixes: ["73150"],
  fee: { mode: "amount", cents: 500 },
};

const noPriceHistory = new (class extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
})();

const empty = () => Promise.resolve([]);

function pricer(clock: FixedClock): Pricer {
  return new Pricer(
    new PricingMaterialsLoader(
      {
        listArchived: empty,
        inScopes: empty,
        inScopesAt: empty,
        candidatesFor: empty,
        listAll: empty,
      },
      {
        liveFor: () => Promise.resolve(null),
        liveAsOf: () => Promise.resolve(null),
        listFor: empty,
        liveEverywhere: empty,
      },
      { inScopes: empty, inScopesAt: empty, candidatesFor: empty, listAll: empty },
      { volumesFor: () => Promise.resolve(new Map()) },
      { inScopes: empty, inScopesAt: empty, candidatesFor: empty, listAll: empty },
      { liveFor: empty, liveAsOf: empty },
      {
        volumesFor: () => Promise.resolve(new Map<string, number>()),
        committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
      },
    ),
    clock,
    noPriceHistory,
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
}

const pickups: PickupAddressRepository = {
  list: () => Promise.resolve([LABO_POINT]),
  resolve: () => Promise.resolve(LABO_POINT),
};

const zones: DeliveryZoneRepository = {
  list: () => Promise.resolve([ZONE]),
  findById: () => Promise.resolve(ZONE),
  resolveForPostalCode: () => Promise.resolve(ZONE),
  create: () => Promise.resolve("zone_1"),
  update: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

/** L'engagement comptable : `free` par défaut, comme une commande au compte encore libre. */
export class FixedEngagements extends AccountOrderEngagementReader {
  constructor(private readonly engagement: AccountEngagement | null = { kind: "free" }) {
    super();
  }

  engagementOf(): Promise<AccountEngagement | null> {
    return Promise.resolve(this.engagement);
  }
}

/** La recomposition réelle, sur les doubles de la scène. */
export function revisingAt(
  clock: FixedClock,
  options: {
    readonly plans?: OrderPlanGate;
    readonly engagements?: AccountOrderEngagementReader;
    readonly catalogItems?: readonly UnsealedCatalogItem[];
    readonly intake?: OrderIntake;
  } = {},
): OrderRevising {
  const catalog = new InMemoryProductCatalog(options.catalogItems ?? CATALOG);
  const classifications = new FixedLineClassifications();
  const composition = new OrderComposition(
    new OrderLinePricing(catalog, pricer(clock), clock),
    new CartAdjustments(
      pickups,
      zones,
      { current: () => Promise.resolve(DEFAULT_DELIVERY_AVAILABILITY) },
      { preferredPickupOf: () => Promise.resolve(null) },
      classifications,
    ),
    { of: () => Promise.resolve(NO_DELIVERY_DEFAULTS) },
    new OrderOperations(noSaleOperations(clock.now())),
    new FixedDeliveryVat(),
    classifications,
    new CustomerAudiences({ companyStatusOf: () => Promise.resolve("active") }),
  );
  const cutoffs = new OrderCutoffGate(
    { list: () => Promise.resolve([]) },
    catalog,
    { openFor: () => Promise.resolve(null), consume: () => Promise.resolve() },
    clock,
  );
  return new OrderRevising(
    composition,
    cutoffs,
    options.plans ?? openPlanGate(),
    new CancellationRule(options.engagements ?? new FixedEngagements()),
    options.intake ?? intakeAt(undefined, "active", [], {}, undefined, clock),
  );
}

/** La commande voulue : un retrait au Labo, le jour `DAY`, 10 croissants par défaut. */
export function content(over: Partial<OrderContent> = {}): OrderContent {
  return {
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: LABO_POINT.id,
    requestedDeliveryDate: DAY,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity: 10 }],
    ...over,
  };
}

/**
 * La commande telle que passée PAR LA MÊME RECOMPOSITION : une commande au
 * compte d'une société active, 10 croissants retirés au Labo. Ses montants
 * sont donc ceux que la passation aurait écrits.
 */
export async function placedOrder(over: Partial<RevisableOrder> = {}): Promise<RevisableOrder> {
  const draft = await revisingAt(new FixedClock(NOW)).compose(
    seed(),
    content(),
    { kind: "staff", staffId: "stf_seed" },
    { requireChange: false },
  );
  const { state } = draft;
  return {
    ...seed(),
    totalCents: state.totalCents,
    fulfillment: {
      method: state.fulfillmentMethod,
      deliveryZoneId: state.deliveryZoneId,
      deliveryAddress: state.deliveryAddress,
      deliveryAddressId: state.deliveryAddressId,
      pickupAddress: state.pickupAddress,
    },
    agreed: state.agreed,
    lines: state.lines,
    ...over,
  };
}

/** Le squelette d'avant la composition — rien que des identités. */
function seed(): RevisableOrder {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-1",
    revision: 0,
    companyId: "co_1",
    billedCompanyId: "co_1",
    principal: null,
    placedByUserId: "usr_1",
    placedByStaffId: null,
    status: "placed",
    paymentStatus: "not_required",
    shortfallDecided: false,
    totalCents: 1,
    stripePaymentIntentId: null,
    cancelledAt: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    serviceDay: DAY,
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: null,
    },
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    note: "",
    lines: [],
    deliveryVatMode: "standard",
    // Une commande de société : composée HT (plan du centime, § 7).
    vatMethod: "line_ht",
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
    catalogVersionId: null,
    customerCancellation: { kind: "not_fixed" },
    customerCancellableUntil: null,
  };
}

/** La lecture sans verrou : la commande au premier regard. */
export class FixedRevisableOrders extends RevisableOrderReader {
  constructor(private readonly order: RevisableOrder | null) {
    super();
  }

  find(): Promise<RevisableOrder | null> {
    return Promise.resolve(this.order);
  }
}

/**
 * La ligne `orders` en mémoire, avec la sémantique de l'écriture conditionnée
 * sur la révision ET sur `placed` ou `confirmed` (R7, plan A2). `underLock` : l'état relu sous le
 * verrou, s'il a bougé depuis le premier regard.
 */
export class InMemoryOrderRevisions extends OrderRevisionRepository {
  readonly saved: { revision: OrderRevisionToSave; author: RevisionActor; at: Date }[] = [];

  constructor(
    private current: RevisableOrder | null,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  lock(orderId: string): Promise<RevisableOrder | null> {
    this.trace.push(`lock:${orderId}`);
    return Promise.resolve(this.current);
  }

  save(revision: OrderRevisionToSave, author: RevisionActor, at: Date): Promise<boolean> {
    this.trace.push(`save:r${String(revision.toRevision)}`);
    const current = this.current;
    if (
      current === null ||
      current.revision !== revision.fromRevision ||
      (current.status !== "placed" && current.status !== "confirmed")
    ) {
      return Promise.resolve(false);
    }
    this.current = { ...current, revision: revision.toRevision };
    this.saved.push({ revision, author, at });
    return Promise.resolve(true);
  }
}

/** Le guichet du fournil : l'issue écrite d'avance, et les journées tenues. */
export class RecordingRevisionDesk extends OrderRevisionDesk {
  readonly noted: {
    days: string[];
    orderId: string;
    revision: number;
    lines: readonly RevisedOrderLine[];
    allowance: OrderRevisionAllowance;
  }[] = [];

  constructor(
    private readonly outcome: OrderRevisionOutcome = "noted",
    private readonly trace: string[] = [],
  ) {
    super();
  }

  note(
    days: readonly ServiceDay[],
    orderId: string,
    revision: number,
    lines: readonly RevisedOrderLine[],
    allowance: OrderRevisionAllowance,
  ): Promise<OrderRevisionOutcome> {
    this.trace.push(`desk:${days.map((day) => day.value).join(",")}`);
    this.noted.push({ days: days.map((day) => day.value), orderId, revision, lines, allowance });
    // Le guichet réel ne révise que sous `staff_quantities` ; sinon, inscrite reste inscrite.
    if (
      (this.outcome === "raised" || this.outcome === "unchanged") &&
      allowance !== "staff_quantities"
    ) {
      return Promise.resolve("inscribed");
    }
    return Promise.resolve(this.outcome);
  }
}

/** Le guichet du colisage (plan A2) : l'issue écrite d'avance, et les lignes reçues. */
export class RecordingPackingRevisionDesk extends PackingRevisionDesk {
  readonly revised: {
    day: string;
    orderId: string;
    lines: readonly PackingDueLine[];
    by: string;
  }[] = [];

  constructor(
    private readonly outcome: PackingRevisionOutcome = "revised",
    private readonly trace: string[] = [],
  ) {
    super();
  }

  revise(
    serviceDay: string,
    orderId: string,
    lines: readonly PackingDueLine[],
    revisedBy: string,
  ): Promise<PackingRevisionOutcome> {
    this.trace.push(`packing:${serviceDay}`);
    this.revised.push({ day: serviceDay, orderId, lines, by: revisedBy });
    return Promise.resolve(this.outcome);
  }
}

/** La ligne d'encaissement recalée, notée. */
export class RecordingRevaluation extends AccountOrderRevaluation {
  readonly revalued: { orderId: string; amountCents: number }[] = [];

  constructor(private readonly trace: string[] = []) {
    super();
  }

  revalue(orderId: string, amountCents: number): Promise<void> {
    this.trace.push(`revalue:${String(amountCents)}`);
    this.revalued.push({ orderId, amountCents });
    return Promise.resolve();
  }
}

/** Un seul rôle, pour tout demandeur : membre (`orders`) ou étranger (`null`). */
export class OneRoleAccess extends OrderAccessReader {
  constructor(private readonly role: OrderRole | null) {
    super();
  }

  accessToOrder(): Promise<OrderRole | null> {
    return Promise.resolve(this.role);
  }
}

/** Le geste monté sur la scène, et ce qu'il laisse voir. */
export function reviseScene(
  order: RevisableOrder,
  options: {
    readonly clock?: FixedClock;
    readonly underLock?: RevisableOrder | null;
    readonly desk?: OrderRevisionOutcome;
    readonly packing?: PackingRevisionOutcome;
    readonly role?: OrderRole | null;
    readonly plans?: OrderPlanGate;
    readonly engagements?: AccountOrderEngagementReader;
    readonly catalogItems?: readonly UnsealedCatalogItem[];
  } = {},
) {
  const trace: string[] = [];
  const clock = options.clock ?? new FixedClock(NOW);
  const revisions = new InMemoryOrderRevisions(
    options.underLock === undefined ? order : options.underLock,
    trace,
  );
  const desk = new RecordingRevisionDesk(options.desk ?? "noted", trace);
  const packing = new RecordingPackingRevisionDesk(options.packing ?? "revised", trace);
  const notes = new RecordingDeliveryNoteFollowing();
  const revaluation = new RecordingRevaluation(trace);
  const durable = new RecordingDurable();
  const handler = new ReviseOrderHandler(
    new RevisionWall(
      new FixedRevisableOrders(order),
      new OneRoleAccess(options.role === undefined ? "orders" : options.role),
    ),
    revisingAt(clock, {
      ...(options.plans === undefined ? {} : { plans: options.plans }),
      ...(options.engagements === undefined ? {} : { engagements: options.engagements }),
      ...(options.catalogItems === undefined ? {} : { catalogItems: options.catalogItems }),
    }),
    revisions,
    new OrderWorkshopRevision(desk, packing),
    revaluation,
    notes,
    durable,
    new DirectUnitOfWork(),
    clock,
  );
  return { handler, trace, revisions, desk, packing, notes, revaluation, durable };
}
