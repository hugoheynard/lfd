import { orderPretaxCents } from "@lfd/money";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { OrderTotalChangedError } from "../../../domain/errors/order-total-changed.error.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedOrderPayers, ownPayers } from "./payer-doubles.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import type { AdminPlaceOrderPayload, PickupAddressView } from "@lfd/contracts";

import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import { AppConfig } from "../../../../../platform/config/app-config.js";
import {
  PaymentGateway,
  type CreateIntentParams,
} from "../../../../payments/domain/payment-gateway.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import {
  DeliveryClosedForAudienceError,
  AccountSettlementNotGrantedError,
  SuspendedCompanyAccountSettlementError,
  OrderCompanyNotFoundError,
} from "../../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { type UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import {
  type DeliveryDefaults,
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
} from "../../../domain/ports/delivery-defaults.reader.js";
import { PriceFloorReader } from "../../../../pricing/domain/ports/price-floor.reader.js";
import { VolumeLadderReader } from "../../../../pricing/domain/ports/volume-ladder.reader.js";
import { SkuVolumeReader } from "../../../../pricing/domain/ports/sku-volume.reader.js";
import { PriceRuleReader } from "../../../../pricing/domain/ports/price-rule.reader.js";
import { CompanyMercurialeReader } from "../../../../pricing/domain/ports/company-mercuriale.reader.js";
import { CartAdjustments } from "../../services/cart-adjustments.service.js";
import { CustomerAudiences } from "../../services/customer-audiences.service.js";
import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DEFAULT_DELIVERY_AVAILABILITY, type DeliveryAvailabilityView } from "@lfd/contracts";
import { OrderDrafting } from "../../services/order-drafting.service.js";
import { OrderOperations } from "../../services/order-operations.service.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import { OrderLateFeeReader } from "../../../domain/ports/order-late-fee.reader.js";
import { FixedDeliveryVat } from "./fixed-delivery-vat.js";
import { FixedSalesTerms } from "./fixed-sales-terms.js";
import { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { SameDayOrderClosedError } from "../../../domain/errors/same-day-order-closed.error.js";
import type { ShelfCircuit } from "../../services/shelf-circuit.service.js";
import { FixedShelfStock, shelfCircuitOf } from "../../services/__tests__/shelf-circuit-doubles.js";
import {
  ShelfStockShortError,
  ShelfWithoutCreditRefusedError,
} from "../../../domain/errors/shelf-circuit-errors.js";
import {
  FixedClosedPlans,
  FixedSameDay,
  gateOf,
  openPlanGate,
  RecordingAdmissionDesk,
} from "./plan-doubles.js";
import { OrderLinePricing } from "../../services/order-line-pricing.service.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import { VolumeCommitmentReader } from "../../../../pricing/domain/ports/volume-commitment.reader.js";
import { intakeAt } from "./intake-doubles.js";
import { EstimateOrderForCustomerHandler } from "../../queries/estimate-order-for-customer.handler.js";
import { EstimateOrderForCustomerQuery } from "../../queries/estimate-order-for-customer.query.js";
import { OrderCutoffNotice } from "../../services/order-cutoff-notice.service.js";
import { RecordingShelfStockLock } from "../../../../resupply/application/__tests__/shelf-stock-doubles.js";
import { OrdersClosedForAudienceError } from "../../../domain/errors/orders-closed-for-audience.error.js";
import {
  CounterAccountSettlementNotGrantedError,
  CounterLinkSettlementRefusedError,
} from "../../../domain/errors/shelf-order-errors.js";
import type { OrderIntake } from "../../services/order-intake.service.js";
import { CustomerVolumeReader } from "../../../../pricing/domain/ports/customer-volume.reader.js";

/**
 * Aucun réglage d'adresse : tout ce que la commande porte y est donc un choix.
 * Les cas de préremplissage sont couverts par `agreed-fulfillment.spec` — ici on
 * exerce le handler, pas la règle de provenance.
 */
function noDeliveryDefaults(): DeliveryDefaultsReader {
  return { of: (): Promise<DeliveryDefaults> => Promise.resolve(NO_DELIVERY_DEFAULTS) };
}
import { PlaceOrderForCustomerCommand } from "../place-order-for-customer.command.js";
import { PlaceOrderForCustomerHandler } from "../place-order-for-customer.handler.js";
import { SeeingPlaceOrderForCustomerHandler, UNSEEN_TOTAL_CENTS } from "./seeing-total-handlers.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import type { CatalogPricing } from "@lfd/contracts";
import { VIENNOISERIES } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/index.js";
import { RecordingDurable } from "./durable-doubles.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { CatalogViewers } from "../../../../catalog/application/catalog-viewers.service.js";
import { InMemoryServedCompanies } from "../../../../catalog/infrastructure/in-memory-served-companies.js";
import { noLinePromotionSupply } from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { pointDiscountPromotions } from "../../services/__tests__/basket-promotions.doubles.js";

/**
 * L'historique du tarif canonique — **jamais consulté ici** : ces cas ne posent
 * aucune question datée, donc la porte n'a rien à resceller. Il refuse plutôt
 * que de rendre un tarif : si un cas se mettait à relire le passé, il le dirait
 * au lieu de servir un prix d'aujourd'hui déguisé en prix d'alors.
 */
const noPriceHistory = new (class extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
})();

/**
 * L'instant où les prix sont résolus. Une constante plutôt qu'un `new Date()` :
 * le service lit désormais l'horloge de la requête, et un test qui laisserait
 * le mur décider retomberait sur la bombe des fenêtres glissantes.
 */
const PRICED_AT = new Date("2026-01-15T09:00:00.000Z");

/**
 * Catalogue **sans règle tarifaire** : le comportement du système avant qu'une
 * seule règle n'existe. Ces suites éprouvent la commande, pas le prix — la
 * résolution a ses propres tests, purs et exhaustifs.
 */
/** Aucun tarif négocié : le client paie le catalogue, comme un visiteur. */
const noMercuriales: CompanyMercurialeReader = {
  liveFor: () => Promise.resolve(null),
  liveAsOf: () => Promise.resolve(null),
  // Les deux autres questions du port. Ces suites ne les posent pas, mais un
  // doublé partiel n'est pas le port : c'est ce que `tsconfig.test.json`
  // attrape et que ts-jest laisse passer.
  listFor: () => Promise.resolve([]),
  liveEverywhere: () => Promise.resolve([]),
};

const noPriceRules: PriceRuleReader = {
  listArchived: () => Promise.resolve([]),
  inScopes: () => Promise.resolve([]),
  // La relecture datée n'est pas le sujet de ces cas : même réponse.
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

/** Aucune limite posée : le prix sort du pipeline tel quel. */
const noPriceFloors: PriceFloorReader = {
  inScopes: () => Promise.resolve([]),
  // La relecture datée n'est pas le sujet de ces cas : même réponse.
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

/**
 * Aucune vente mesurée. Sans plancher dynamique conditionné au volume, ce port
 * n'est jamais appelé — le double existe pour que la construction reste possible,
 * pas parce que ces suites mesurent quoi que ce soit.
 */
const noSkuVolumes: SkuVolumeReader = { volumesFor: () => Promise.resolve(new Map()) };

/** Aucun barème de volume : ces cas mesurent autre chose. */
const noVolumeLadders: VolumeLadderReader = {
  inScopes: () => Promise.resolve([]),
  // La relecture datée n'est pas le sujet de ces cas : même réponse.
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

/**
 * **Aucun engagement de volume.** Le double le plus important du lot : sans lui,
 * le palier se jouerait sur un cumul lu ailleurs, et ces tests-ci ne parleraient
 * plus de ce qu'ils prétendent mesurer.
 */
const noCommitments: VolumeCommitmentReader = {
  liveFor: () => Promise.resolve([]),
  liveAsOf: () => Promise.resolve([]),
};

const noCustomerVolumes: CustomerVolumeReader = {
  volumesFor: () => Promise.resolve(new Map<string, number>()),
  committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
};

const CATALOG: Record<string, UnsealedCatalogItem> = {
  "VIE-001": {
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 200_000,
    vatRate: 0,
    family: VIENNOISERIES,
    allergens: null,
    orderTimeLimit: null,
  },
};

const catalog = new InMemoryProductCatalog(Object.values(CATALOG));

const LABO: PickupAddressView = {
  id: "pickup_1",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  discounts: { b2b: null, b2c: null },
  // Aucune heure déclarée : le point n'oppose alors rien à la tranche demandée.
  // Les cas d'ouverture sont couverts par `agreed-fulfillment.spec`.
  opening: { publicOpening: null, proPickup: null },
};

/**
 * Garde doublée. `roleOf` est appelée avec l'ACHETEUR : c'est tout l'objet du
 * mur de cette surface, et le double le capture pour qu'un test puisse vérifier
 * qu'on n'a pas interrogé le commercial par mégarde.
 */
function guard(
  role: OrderRole | null,
  status: OrderCompanyStatus | null = "active",
  onAccount: AccountSettlementStanding = "granted",
  asked: { userId: string | null } = { userId: null },
): OrderGuardReader {
  return {
    roleOf: (userId) => {
      asked.userId = userId;
      return Promise.resolve(role);
    },
    companyStatusOf: () => Promise.resolve(status),
    settlesOnAccount: () => Promise.resolve(onAccount),
  };
}

const pickups: PickupAddressRepository = {
  list: () => Promise.resolve([LABO]),
  resolve: () => Promise.resolve(LABO),
};

/** Aucune société n'a de point préféré : un retrait sans choix prend le seul point. */
const noPreferredPickup: PreferredPickupReader = {
  preferredPickupOf: () => Promise.resolve(null),
};

/** Le réglage de livraison ; par défaut, ligne absente = ouvert aux deux. */
function deliveryAvailability(
  view: DeliveryAvailabilityView = DEFAULT_DELIVERY_AVAILABILITY,
): DeliveryAvailabilityReader {
  return { current: () => Promise.resolve(view) };
}

const zones: DeliveryZoneRepository = {
  list: () => Promise.resolve([]),
  findById: () => Promise.resolve(null),
  resolveForPostalCode: () => Promise.resolve(null),
  create: () => Promise.resolve("zone_1"),
  update: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

function payments(sink: { intent: CreateIntentParams | null } = { intent: null }): PaymentGateway {
  return {
    createIntent: (params) => {
      sink.intent = params;
      return Promise.resolve({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret" });
    },
    retrieveIntent: () =>
      Promise.resolve({
        paymentIntentId: "pi_1",
        clientSecret: "pi_1_secret",
        state: "awaiting_payment",
      }),
    cancelIntent: () => Promise.resolve({ kind: "cancelled" }),
    publishableKey: () => "pk_test_123",
    parseWebhook: () => ({ kind: "ignored" }),
  };
}

function repo(sink: { placed: OrderToPlace | null }): OrderRepository {
  return {
    place: (order) => {
      sink.placed = order.toPersistence();
      return Promise.resolve({ id: "order_1", orderNumber: "ORD-1" });
    },
    // `null` = aucune ligne n'a franchi. Ce spec n'éprouve pas le règlement :
    // c'est la valeur qui dit « rien à publier », pas un bouchon vide.
    markPaid: () => Promise.resolve(null),
    markPaymentFailed: () => Promise.resolve(null),
    markFulfilled: () => Promise.resolve(true),
    markReady: () => Promise.reject(new Error("non utilisé")),
    absorbIntoPlan: () => Promise.reject(new Error("non utilisé")),
    markAbandoned: () => Promise.reject(new Error("non utilisé")),
    failAtClosing: () => Promise.reject(new Error("non utilisé")),
  };
}

/** Une racine cliente configurée — le cas nominal du lien de règlement. */
class FakeConfig extends AppConfig {
  constructor(private readonly root: string | null) {
    super();
  }

  override clientBaseUrl(): string | null {
    return this.root;
  }
}

/** Le créneau que la commande a choisi — obligatoire depuis le 2026-10-14. */
const CHOSEN_WINDOW = { start: "07:00", end: "08:00" };

/**
 * Le TTC du panier par défaut. Donné EXPLICITEMENT là où une suite compte les
 * lectures : un payload « pas vu » ferait deux passages (`seeing-total-handlers.ts`).
 */
const DEFAULT_TOTAL_CENTS = 400;

function payload(over: Partial<AdminPlaceOrderPayload> = {}): AdminPlaceOrderPayload {
  return {
    expectedTotalCents: UNSEEN_TOTAL_CENTS,
    companyId: "c1",
    buyerUserId: "buyer_1",
    settlement: "account",
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: null,
    requestedDeliveryDate: "2026-09-01",
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    // Le créneau est obligatoire à toute passation (Hugo, 2026-10-14). Les
    // points de ces suites n'ont pas d'heures déclarées : il n'y est pas jugé.
    requestedWindow: CHOSEN_WINDOW,
    ...over,
  };
}

interface HandlerOptions {
  readonly payments?: PaymentGateway;
  readonly events?: RecordingPublisher;
  readonly clientBaseUrl?: string | null;
  readonly delivery?: DeliveryAvailabilityView;
  readonly payers?: FixedOrderPayers;
  readonly plans?: OrderPlanGate;
  readonly salesTerms?: FixedSalesTerms;
  readonly durable?: RecordingDurable;
  readonly shelf?: ShelfCircuit;
  readonly intake?: OrderIntake;
}

/** Ce que le constructeur de la composition lit des options d'un cas. */
type DraftingOptions = Pick<
  HandlerOptions,
  "delivery" | "payers" | "plans" | "salesTerms" | "shelf"
>;

/** La composition sur les doubles de ces suites — partagée par la passation et l'estimation. */
function draftingFor(guardDouble: OrderGuardReader, options: DraftingOptions = {}): OrderDrafting {
  return new OrderDrafting(
    new OrderLinePricing(
      catalog,
      // LA porte du prix, montée sur la seule séquence de chargement du dépôt.
      new Pricer(
        new PricingMaterialsLoader(
          noPriceRules,
          noMercuriales,
          noPriceFloors,
          noSkuVolumes,
          noVolumeLadders,
          noCommitments,
          noCustomerVolumes,
          noLinePromotionSupply(),
        ),
        new FixedClock(PRICED_AT),
        noPriceHistory,
        ownPricingParties(),
        new RecordingTimings(),
        new FixedStopwatch(),
      ),
      new CatalogViewers(new InMemoryServedCompanies()),
    ),
    new CartAdjustments(
      pickups,
      zones,
      deliveryAvailability(options.delivery),
      noPreferredPickup,
      pointDiscountPromotions(pickups),
    ),
    noDeliveryDefaults(),
    noOrderCutoffs,
    new FixedClock(PRICED_AT),
    catalog,
    noWaivers,
    noLateFee,
    new CustomerAudiences(guardDouble),
    new OrderOperations(noSaleOperations(PRICED_AT)),
    options.payers ?? ownPayers(),
    new FixedDeliveryVat(),
    options.plans ?? openPlanGate(),
    options.salesTerms ?? new FixedSalesTerms(),
    new FixedLineClassifications(),
    options.shelf ?? shelfCircuitOf(options.plans ?? openPlanGate()),
  );
}

function handler(
  guardDouble: OrderGuardReader,
  sink: { placed: OrderToPlace | null },
  options: HandlerOptions = {},
): PlaceOrderForCustomerHandler {
  // `in` et non `??` : `null` est une valeur que les tests passent EXPRÈS, et
  // `??` la remplacerait par le défaut — le test aurait alors vérifié le cas
  // nominal en croyant vérifier l'absence de racine.
  const clientBaseUrl =
    "clientBaseUrl" in options ? (options.clientBaseUrl ?? null) : "https://boutique.lfc.fr";
  return new SeeingPlaceOrderForCustomerHandler(
    guardDouble,
    draftingFor(guardDouble, options),
    repo(sink),
    options.payments ?? payments(),
    options.events ?? new RecordingPublisher(),
    new FakeConfig(clientBaseUrl),
    noWaivers,
    new FixedClock(PRICED_AT),
    { run: <T>(work: () => Promise<T>): Promise<T> => work() },
    options.durable ?? new RecordingDurable(),
    options.shelf ?? shelfCircuitOf(options.plans ?? openPlanGate()),
    options.intake ?? intakeAt(),
  );
}

/**
 * **Aucune règle d'heure limite** — le défaut de la plateforme, et donc le seul
 * état où ces spécifications-ci n'ont rien à voir avec le calendrier. Les refus
 * pour cause de limite dépassée s'éprouvent dans `order-cutoff-guard.spec.ts`
 * (la règle, pure) et dans `orders.e2e-spec.ts` (la porte HTTP).
 */
const noOrderCutoffs: OrderCutoffReader = { list: () => Promise.resolve([]) };

/**
 * **Aucune dérogation ouverte**, et rien à consommer : ces spécifications-ci ne
 * parlent pas d'heure limite. Le sujet s'éprouve dans `order-cutoff-guard.spec`
 * (la règle) et dans `order-cutoffs.e2e-spec` (la porte HTTP).
 */
/**
 * **Aucune surtaxe réglée** — l'état par défaut, et un état valable : rattraper
 * sans facturer est un choix. Ces spécifications ne parlent pas d'argent tardif.
 */
const noLateFee: OrderLateFeeReader = { current: () => Promise.resolve(null) };

const noWaivers: OrderCutoffWaiverGate = {
  openFor: () => Promise.resolve(null),
  consume: () => Promise.resolve(),
};

describe("PlaceOrderForCustomerHandler — la langue", () => {
  it("n'enregistre aucune langue : l'écran du back-office ne dit rien du client (lot A3)", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders", "active", "granted"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(sink.placed?.locale).toBeNull();
  });
});

describe("PlaceOrderForCustomerHandler — le mur", () => {
  it("vérifie l'appartenance de L'ACHETEUR, pas celle du commercial", async () => {
    // Le piège de cette surface : un commercial n'est membre d'aucune société
    // cliente. Vérifier son appartenance refuserait toutes les commandes ;
    // l'oublier les autoriserait toutes.
    const asked = { userId: null as string | null };
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders", "active", "granted", asked), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(asked.userId).toBe("buyer_1");
  });

  it("refuse par un 404 non-divulguant quand l'acheteur n'est pas membre", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard(null), sink).execute(new PlaceOrderForCustomerCommand("staff_1", payload())),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
    expect(sink.placed).toBeNull();
  });
});

/**
 * Lot O3 (`plan-reglages-commandes.md`, §8.3, Hugo 2026-10-14) : l'équipe
 * peut encore saisir pour une journée arrêtée — la commande est REÇUE, marquée
 * « hors plan », et le retirage du fournil la fera entrer.
 */
describe("PlaceOrderForCustomerHandler — l'arrêt du plan", () => {
  it("REÇOIT une journée au plan arrêté, marquée « hors plan » (§8.3)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const day = payload().requestedDeliveryDate;
    const plans = gateOf(new FixedClosedPlans([day]), new RecordingAdmissionDesk([day]));

    await handler(guard("orders", "active", "granted"), sink, { plans }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(sink.placed?.placedOffPlan).toBe(true);
  });

  it("arrêté entre la composition et l'écriture : reçue hors plan, sous le verrou", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const day = payload().requestedDeliveryDate;
    const plans = gateOf(new FixedClosedPlans(), new RecordingAdmissionDesk([day]));

    await handler(guard("orders", "active", "granted"), sink, { plans }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(sink.placed?.placedOffPlan).toBe(true);
  });

  it("un plan ouvert : la commande n'est pas hors plan", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders", "active", "granted"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(sink.placed?.placedOffPlan).toBe(false);
  });

  it("le jour même fermé par le réglage refuse aussi l'équipe, plan ouvert", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const today = "2026-01-01";

    await expect(
      handler(guard("orders", "active", "granted"), sink).execute(
        new PlaceOrderForCustomerCommand("staff_1", payload({ requestedDeliveryDate: today })),
      ),
    ).rejects.toBeInstanceOf(SameDayOrderClosedError);
    expect(sink.placed).toBeNull();
  });

  it("le jour même, plan arrêté : l'équipe est reçue hors plan, le réglage ne s'y oppose pas", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const today = "2026-01-01";
    const plans = gateOf(new FixedClosedPlans([today]), new RecordingAdmissionDesk([today]));

    await handler(guard("orders", "active", "granted"), sink, { plans }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ requestedDeliveryDate: today })),
    );

    expect(sink.placed?.placedOffPlan).toBe(true);
  });

  it("tient la journée sous le verrou avant d'écrire la commande", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const writtenWhenHeld: boolean[] = [];
    const desk = new RecordingAdmissionDesk([], () => writtenWhenHeld.push(sink.placed !== null));

    await handler(guard("orders", "active", "granted"), sink, {
      plans: gateOf(new FixedClosedPlans(), desk),
    }).execute(new PlaceOrderForCustomerCommand("staff_1", payload()));

    expect(desk.held).toEqual([payload().requestedDeliveryDate]);
    expect(writtenWhenHeld).toEqual([false]);
  });
});

/**
 * **Le « Retrait immédiat » au serveur** (lot L4 du circuit du jour J,
 * `jour-meme-sur-stock.md`) : l'écran envoie `shelf`, la
 * commande est prise sur la vitrine — sans le verrou de la journée, sans
 * créneau à garder, et le pro sans crédit suit le réglage.
 */
describe("PlaceOrderForCustomerHandler — sur la vitrine (L4)", () => {
  const TODAY = "2026-01-01";
  const SITE = LABO.id;

  function shelfFor(
    plans: OrderPlanGate,
    over: { readonly left?: number; readonly sameDay?: FixedSameDay } = {},
  ): ShelfCircuit {
    return shelfCircuitOf(plans, {
      sameDay: over.sameDay ?? new FixedSameDay({ sameDayProAllowed: true }),
      stock: new FixedShelfStock().set(TODAY, SITE, [
        {
          sku: "VIE-001",
          label: "Croissant",
          saleUnit: "piece",
          receivedQuantity: 5,
          estimatedStock: over.left ?? 5,
        },
      ]),
    });
  }

  const shelfPayload = (over: Partial<AdminPlaceOrderPayload> = {}) =>
    payload({ requestedDeliveryDate: TODAY, supply: "shelf", ...over });

  it("prise sur la vitrine, au compte, sans tenir la journée — plan arrêté ou non", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const desk = new RecordingAdmissionDesk([TODAY]);
    const plans = gateOf(new FixedClosedPlans([TODAY]), desk);

    await handler(guard("orders", "active", "granted"), sink, {
      plans,
      shelf: shelfFor(plans),
    }).execute(new PlaceOrderForCustomerCommand("staff_1", shelfPayload()));

    expect(sink.placed).toMatchObject({ supply: "shelf", placedOffPlan: false });
    expect(desk.held).toEqual([]);
  });

  it("refusée quand le réglage n'ouvre pas aujourd'hui aux pros", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const plans = gateOf();

    await expect(
      handler(guard("orders", "active", "granted"), sink, {
        plans,
        shelf: shelfFor(plans, { sameDay: new FixedSameDay({ sameDayPublicAllowed: true }) }),
      }).execute(new PlaceOrderForCustomerCommand("staff_1", shelfPayload())),
    ).rejects.toBeInstanceOf(SameDayOrderClosedError);
    expect(sink.placed).toBeNull();
  });

  it("refusée au-delà du reste", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const plans = gateOf();

    await expect(
      handler(guard("orders", "active", "granted"), sink, {
        plans,
        shelf: shelfFor(plans, { left: 1 }),
      }).execute(new PlaceOrderForCustomerCommand("staff_1", shelfPayload())),
    ).rejects.toBeInstanceOf(ShelfStockShortError);
    expect(sink.placed).toBeNull();
  });

  /**
   * Régression : le « Retrait immédiat » du comptoir acceptait un lien de
   * règlement, crédit ou pas (E4, Hugo, 2026-11-03) ; au comptoir, la saisie
   * se règle au compte seulement.
   */
  it("au comptoir, le lien de règlement est refusé même avec un crédit, sans intention", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intents = { intent: null as CreateIntentParams | null };
    const plans = gateOf();

    await expect(
      handler(guard("orders", "active", "granted"), sink, {
        plans,
        shelf: shelfFor(plans),
        payments: payments(intents),
      }).execute(
        new PlaceOrderForCustomerCommand(
          "staff_1",
          shelfPayload({ settlement: "link", entryShortcut: "immediate_pickup" }),
        ),
      ),
    ).rejects.toBeInstanceOf(CounterLinkSettlementRefusedError);
    expect(intents.intent).toBeNull();
    expect(sink.placed).toBeNull();
  });

  /**
   * Régression : au comptoir, une société SUSPENDUE qui tentait le lien
   * recevait « Choisissez « Au compte » », qui la refusait à son tour
   * (Hugo, 2026-11-03) ; le refus du lien dit désormais la cause réelle.
   */
  it("au comptoir, le lien d'une société suspendue nomme la suspension, pas « Au compte »", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const plans = gateOf();

    const refusal = handler(guard("orders", "suspended", "granted"), sink, {
      plans,
      shelf: shelfFor(plans),
    }).execute(
      new PlaceOrderForCustomerCommand(
        "staff_1",
        shelfPayload({ settlement: "link", entryShortcut: "immediate_pickup" }),
      ),
    );

    await expect(refusal).rejects.toMatchObject({
      code: "orders.counter.company_suspended",
    });
    await expect(refusal).rejects.toBeInstanceOf(CounterAccountSettlementNotGrantedError);
    expect(sink.placed).toBeNull();
  });

  it("au comptoir, le lien d'une société active sans crédit garde le message du lien", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const plans = gateOf();

    await expect(
      handler(guard("orders", "active", "none"), sink, {
        plans,
        shelf: shelfFor(plans),
      }).execute(
        new PlaceOrderForCustomerCommand(
          "staff_1",
          shelfPayload({ settlement: "link", entryShortcut: "immediate_pickup" }),
        ),
      ),
    ).rejects.toBeInstanceOf(CounterLinkSettlementRefusedError);
    expect(sink.placed).toBeNull();
  });

  it("au comptoir, au compte : le « Retrait immédiat » passe", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const plans = gateOf();

    await handler(guard("orders", "active", "granted"), sink, {
      plans,
      shelf: shelfFor(plans),
    }).execute(
      new PlaceOrderForCustomerCommand(
        "staff_1",
        shelfPayload({ settlement: "account", entryShortcut: "immediate_pickup" }),
      ),
    );

    expect(sink.placed).toMatchObject({ supply: "shelf", entryShortcut: "immediate_pickup" });
  });

  it("un pro sans crédit, réglage « refuser » : le lien de paiement est refusé, sans intention", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intents = { intent: null as CreateIntentParams | null };
    const plans = gateOf();

    await expect(
      handler(guard("orders", "active", "none"), sink, {
        plans,
        payments: payments(intents),
        shelf: shelfFor(plans),
      }).execute(new PlaceOrderForCustomerCommand("staff_1", shelfPayload({ settlement: "link" }))),
    ).rejects.toBeInstanceOf(ShelfWithoutCreditRefusedError);
    expect(intents.intent).toBeNull();
  });

  it("un pro sans crédit, réglage « lien de paiement » : la commande attend son règlement", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const plans = gateOf();
    const sameDay = new FixedSameDay({
      sameDayProAllowed: true,
      sameDayProWithoutCredit: "payment_link",
    });

    const result = await handler(guard("orders", "active", "none"), sink, {
      plans,
      shelf: shelfFor(plans, { sameDay }),
    }).execute(new PlaceOrderForCustomerCommand("staff_1", shelfPayload({ settlement: "link" })));

    expect(sink.placed).toMatchObject({ supply: "shelf", paymentStatus: "pending" });
    expect(result.paymentUrl).toBeDefined();
  });
});

/**
 * Plan `remise-et-livraison-par-clientele`, Q1 (Hugo, 2026-09-15) : le staff ne
 * livre pas quand la livraison est fermée au B2B — même règle pour tous.
 */
describe("PlaceOrderForCustomerHandler — la livraison par clientèle", () => {
  it("refuse le coursier pour une société active quand la livraison est fermée aux pros", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders"), sink, {
        delivery: { ...DEFAULT_DELIVERY_AVAILABILITY, openToB2b: false },
      }).execute(
        new PlaceOrderForCustomerCommand(
          "staff_1",
          payload({
            fulfillmentMethod: "delivery",
            pickupAddressId: null,
            deliveryAddress: {
              label: "",
              ligne1: "12 rue du Test",
              ligne2: "",
              codePostal: "73150",
              ville: "Val d'Isère",
              pays: "France",
            },
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(DeliveryClosedForAudienceError);
    expect(sink.placed).toBeNull();
  });
});

describe("PlaceOrderForCustomerHandler — la trace", () => {
  it("porte la commande au nom du client ET marque qui l'a saisie", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(sink.placed).toMatchObject({
      companyId: "c1",
      placedByUserId: "buyer_1",
      placedByStaffId: "staff_1",
    });
  });

  /** 2026-10-07 : la livraison l'apprenait par un appel en mémoire, perdu à un redémarrage. */
  it("écrit le fait durable « commande passée » pour la livraison", async () => {
    const durable = new RecordingDurable();
    const sink = { placed: null as OrderToPlace | null };

    const placed = await handler(guard("orders"), sink, { durable }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    expect(durable.facts).toEqual([new CommerceOrderPlacedFact(placed.id).durableFact()]);
  });

  it("publie l'événement au nom de l'ACHETEUR — le journal compte des clients", async () => {
    const events = new RecordingPublisher();
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders"), sink, { events }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    const [event] = events.published;
    expect(event).toBeInstanceOf(OrderPlacedEvent);
    expect((event as OrderPlacedEvent).placedByUserId).toBe("buyer_1");
  });
});

describe("PlaceOrderForCustomerHandler — le règlement", () => {
  it("au compte : rien à encaisser quand le crédit est accordé", async () => {
    const intents = { intent: null as CreateIntentParams | null };
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders", "active", "granted"), sink, {
      payments: payments(intents),
    }).execute(new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })));

    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(intents.intent).toBeNull();
    expect(result.paymentUrl).toBeUndefined();
  });

  it("REFUSE le compte à une société sans crédit — le mur de cette surface", async () => {
    // Sans ce refus, un écran de back-office suffirait à accorder un délai de
    // paiement que personne n'a négocié.
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders", "active", "none"), sink).execute(
        new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
      ),
    ).rejects.toBeInstanceOf(AccountSettlementNotGrantedError);
    expect(sink.placed).toBeNull();
  });

  it("REFUSE le compte à une société dont le prélèvement est BLOQUÉ, en le disant", async () => {
    // Plan « blocage du prélèvement », §1 : le crédit est accordé, la
    // comptabilité l'a suspendu — le back-office ne passe pas outre.
    const sink = { placed: null as OrderToPlace | null };

    const refusal = handler(guard("orders", "active", "blocked"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
    );

    await expect(refusal).rejects.toBeInstanceOf(AccountSettlementNotGrantedError);
    await expect(refusal).rejects.toThrow(/suspendu/u);
    expect(sink.placed).toBeNull();
  });

  it("REFUSE aussi le compte à une société non active", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders", "pending", "granted"), sink).execute(
        new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
      ),
    ).rejects.toBeInstanceOf(AccountSettlementNotGrantedError);
  });

  it("lien : crée l'intention sur le total et rend l'adresse à transmettre", async () => {
    const intents = { intent: null as CreateIntentParams | null };
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders"), sink, { payments: payments(intents) }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(intents.intent).toEqual({ amountCents: 400, currency: "eur", companyId: "c1" });
    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(result.paymentUrl).toBe("https://boutique.lfc.fr/commandes/order_1/regler");
  });

  it("lien SANS racine cliente configurée : la commande passe, sans lien", async () => {
    // On préfère « pas de lien » à une URL inventée : le commercial le dit au
    // client plutôt que de lui dicter une adresse qui ne mène nulle part.
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders"), sink, { clientBaseUrl: null }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(result.paymentUrl).toBeUndefined();
  });

  it("le lien ne demande pas un règlement quand il n'y a rien à encaisser", async () => {
    const intents = { intent: null as CreateIntentParams | null };
    const sink = { placed: null as OrderToPlace | null };

    // Une remise de retrait qui ramène le total à zéro n'existe pas au seed ;
    // on passe par un catalogue à prix nul, seul moyen d'atteindre ce total.
    const gratuit = new InMemoryProductCatalog([
      {
        sku: "VIE-001",
        name: "Croissant offert",
        unitPriceMillicents: 0,
        vatRate: 0,
        family: VIENNOISERIES,
        allergens: null,
        orderTimeLimit: null,
      },
    ]);
    const free = new SeeingPlaceOrderForCustomerHandler(
      guard("orders"),
      new OrderDrafting(
        new OrderLinePricing(
          gratuit,
          // LA porte du prix, montée sur la seule séquence de chargement du dépôt.
          new Pricer(
            new PricingMaterialsLoader(
              noPriceRules,
              noMercuriales,
              noPriceFloors,
              noSkuVolumes,
              noVolumeLadders,
              noCommitments,
              noCustomerVolumes,
              noLinePromotionSupply(),
            ),
            new FixedClock(PRICED_AT),
            noPriceHistory,
            ownPricingParties(),
            new RecordingTimings(),
            new FixedStopwatch(),
          ),
          new CatalogViewers(new InMemoryServedCompanies()),
        ),
        new CartAdjustments(
          pickups,
          zones,
          deliveryAvailability(),
          noPreferredPickup,
          pointDiscountPromotions(pickups),
        ),
        noDeliveryDefaults(),
        noOrderCutoffs,
        new FixedClock(PRICED_AT),
        catalog,
        noWaivers,
        noLateFee,
        new CustomerAudiences(guard("orders")),
        new OrderOperations(noSaleOperations(PRICED_AT)),
        ownPayers(),
        new FixedDeliveryVat(),
        openPlanGate(),
        new FixedSalesTerms(),
        new FixedLineClassifications(),
        shelfCircuitOf(openPlanGate()),
      ),
      repo(sink),
      payments(intents),
      new RecordingPublisher(),
      new FakeConfig("https://boutique.lfc.fr"),
      noWaivers,
      new FixedClock(PRICED_AT),
      { run: <T>(work: () => Promise<T>): Promise<T> => work() },
      new RecordingDurable(),
      shelfCircuitOf(openPlanGate()),
      intakeAt(),
    );

    const result = await free.execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(intents.intent).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(result.paymentUrl).toBeUndefined();
  });
});

/**
 * S4 (`sous-comptes.md` §2.3, T44) : la saisie staff copie le payeur et
 * lit les termes du PAYEUR, comme le client — c'est la même règle
 * (`accountStanding`), écrite une fois.
 */
describe("PlaceOrderForCustomerHandler — un site facturé à son principal", () => {
  const payers = new FixedOrderPayers(
    new Map([
      [
        "c1",
        {
          companyId: "c1",
          companyName: "Chalet Edelweiss",
          groupWithoutDelivery: false,
          billingFollow: { payerId: "alpes", payerName: "Alpes Chalets", payerStatus: "active" },
          principalId: "alpes",
          followsPricing: false,
        },
      ],
    ]),
  );

  it("passe au compte sur le crédit du principal, et le copie sur la commande", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const asked: string[] = [];
    const payerGuard: OrderGuardReader = {
      roleOf: () => Promise.resolve("orders"),
      companyStatusOf: () => Promise.resolve("active"),
      settlesOnAccount: (companyId) => {
        asked.push(companyId);
        return Promise.resolve(companyId === "alpes" ? "granted" : "none");
      },
    };

    await handler(payerGuard, sink, { payers }).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
    );

    expect(sink.placed?.billedCompanyId).toBe("alpes");
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(asked).toEqual(["alpes"]);
  });
});

/**
 * Les CGV figées sur une saisie de l'équipe (plan
 * `legal/plan-cgv-par-audience.md`, C4′) — celles de l'audience du CLIENT,
 * pas du commercial. L'écran les dira « applicables », pas « acceptées ».
 */
describe("PlaceOrderForCustomerHandler — les CGV en vigueur", () => {
  it("une société active porte les CGV pro", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const salesTerms = new FixedSalesTerms({ salesTermsPro: { revision: 2, fileId: "ldf_pro_9" } });

    await handler(guard("orders", "active", "granted"), sink, { salesTerms }).execute(
      new PlaceOrderForCustomerCommand(
        "staff_1",
        payload({ expectedTotalCents: DEFAULT_TOTAL_CENTS }),
      ),
    );

    expect(sink.placed?.salesTerms).toEqual({
      document: "salesTermsPro",
      revision: 2,
      fileId: "ldf_pro_9",
    });
    expect(sink.placed?.placedByStaffId).toBe("staff_1");
    // La saisie de l'équipe porte un membre de société : un compte (L1).
    expect(sink.placed?.buyerKind).toBe("registered");
  });

  it("une société en attente porte les CGV particuliers (C2″)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const salesTerms = new FixedSalesTerms();

    // Par lien de paiement : une société en attente n'a pas de compte.
    await handler(guard("orders", "pending", "granted"), sink, { salesTerms }).execute(
      new PlaceOrderForCustomerCommand(
        "staff_1",
        payload({ settlement: "link", expectedTotalCents: DEFAULT_TOTAL_CENTS }),
      ),
    );

    expect(salesTerms.asked).toEqual(["salesTerms"]);
    expect(sink.placed?.salesTerms).toEqual({
      document: "salesTerms",
      revision: null,
      fileId: null,
    });
  });
});

/**
 * **La saisie de l'équipe, comme si le client commandait lui-même** (D4 de
 * Hugo, 2026-11-03 — `documentation/pricing/saisie/plan-prix-de-la-saisie.md` §5).
 */
describe("PlaceOrderForCustomerHandler — la porte de la boutique (E2)", () => {
  /**
   * Régression : la saisie de l'équipe passait outre une boutique fermée à
   * la clientèle du client porté (E2) ; elle passe désormais la même porte.
   */
  it("refuse la saisie pour un pro quand la boutique est fermée aux pros, sans rien écrire", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders"), sink, {
        intake: intakeAt({ ordersOpenToB2b: false }, "active"),
      }).execute(new PlaceOrderForCustomerCommand("staff_1", payload())),
    ).rejects.toBeInstanceOf(OrdersClosedForAudienceError);
    expect(sink.placed).toBeNull();
  });
});

/**
 * **L'estimation de la saisie** (`EstimateOrderForCustomerHandler`, plan
 * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2) : la même
 * préparation que la passation, lue sans être écrite. Ici, dans la suite de
 * la passation, parce que c'est la parité avec elle qu'on éprouve.
 */
describe("EstimateOrderForCustomerHandler", () => {
  const TODAY = "2026-01-01";

  function estimator(
    guardDouble: OrderGuardReader,
    options: HandlerOptions = {},
  ): EstimateOrderForCustomerHandler {
    const plans = options.plans ?? openPlanGate();
    const shelf = options.shelf ?? shelfCircuitOf(plans);
    return new EstimateOrderForCustomerHandler(
      guardDouble,
      options.intake ?? intakeAt(),
      draftingFor(guardDouble, { ...options, plans, shelf }),
      shelf,
      new OrderCutoffNotice(noOrderCutoffs, catalog, new FixedClock(PRICED_AT)),
    );
  }

  function shelfWith(
    plans: OrderPlanGate,
    left: number,
    lock: RecordingShelfStockLock,
  ): ShelfCircuit {
    return shelfCircuitOf(plans, {
      sameDay: new FixedSameDay({ sameDayProAllowed: true }),
      lock,
      stock: new FixedShelfStock().set(TODAY, LABO.id, [
        {
          sku: "VIE-001",
          label: "Croissant",
          saleUnit: "piece",
          receivedQuantity: 5,
          estimatedStock: left,
        },
      ]),
    });
  }

  it("rend les montants que la passation écrit, au centime", async () => {
    const sink = { placed: null as OrderToPlace | null };
    await handler(guard("orders"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );

    const estimate = await estimator(guard("orders")).execute(
      new EstimateOrderForCustomerQuery("staff_1", payload()),
    );

    expect(estimate.refusal).toBeNull();
    expect(estimate.amounts).toMatchObject({
      subtotalCents: sink.placed?.subtotalCents,
      discountCents: sink.placed?.discountCents,
      deliveryFeeCents: sink.placed?.deliveryFeeCents,
      vatCents: sink.placed?.vatCents,
      totalCents: sink.placed?.totalCents,
    });
  });

  /** Plan L6 : le HT de l'estimation est la règle du bon sur la commande qu'elle compose. */
  it("porte le HT du bon, par la règle qui l'imprime", async () => {
    const sink = { placed: null as OrderToPlace | null };
    await handler(guard("orders"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload()),
    );
    const placed = sink.placed;
    if (placed === null) {
      throw new Error("la passation n'a rien composé");
    }

    const estimate = await estimator(guard("orders")).execute(
      new EstimateOrderForCustomerQuery("staff_1", payload()),
    );

    expect(estimate.amounts?.pretaxCents).toBe(orderPretaxCents(placed));
  });

  // Elle ne reçoit ni dépôt, ni passerelle de paiement, ni publieur : écrire
  // lui est inexprimable. Reste le verrou de la vitrine, qu'elle pourrait prendre.
  it("ne prend pas le verrou de la vitrine", async () => {
    const lock = new RecordingShelfStockLock();
    const plans = openPlanGate();

    await estimator(guard("orders"), { plans, shelf: shelfWith(plans, 5, lock) }).execute(
      new EstimateOrderForCustomerQuery(
        "staff_1",
        payload({ requestedDeliveryDate: TODAY, supply: "shelf" }),
      ),
    );

    expect(lock.taken).toEqual([]);
  });

  it("rend le refus de la composition avec les mots de la passation, sans montants", async () => {
    const estimate = await estimator(guard("orders"), {
      intake: intakeAt({ ordersOpenToB2b: false }, "active"),
    }).execute(new EstimateOrderForCustomerQuery("staff_1", payload()));

    expect(estimate.amounts).toBeNull();
    expect(estimate.refusal?.code).toBe(new OrdersClosedForAudienceError("b2b").code);
    expect(estimate.refusal?.message).toBe(new OrdersClosedForAudienceError("b2b").message);
  });

  it("refuse le lien de règlement au comptoir, comme la passation (E4)", async () => {
    const estimate = await estimator(guard("orders")).execute(
      new EstimateOrderForCustomerQuery(
        "staff_1",
        payload({
          settlement: "link",
          requestedDeliveryDate: TODAY,
          supply: "shelf",
          entryShortcut: "immediate_pickup",
        }),
      ),
    );

    expect(estimate.refusal?.code).toBe(new CounterLinkSettlementRefusedError().code);
  });

  it("garde le mur : un acheteur qui n'est pas membre reste une 404, jamais un refus rendu", async () => {
    await expect(
      estimator(guard(null)).execute(new EstimateOrderForCustomerQuery("staff_1", payload())),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
  });

  it("avertit, sans verrou, que le reste en vitrine ne couvre plus le panier", async () => {
    const lock = new RecordingShelfStockLock();
    const plans = openPlanGate();

    const estimate = await estimator(guard("orders"), {
      plans,
      shelf: shelfWith(plans, 1, lock),
    }).execute(
      new EstimateOrderForCustomerQuery(
        "staff_1",
        payload({ requestedDeliveryDate: TODAY, supply: "shelf" }),
      ),
    );

    expect(estimate.refusal).toBeNull();
    expect(estimate.amounts).not.toBeNull();
    expect(estimate.warnings.map((warning) => warning.code)).toEqual(["orders.shelf.stock_short"]);
    expect(lock.taken).toEqual([]);
  });

  it("avertit qu'une société sans crédit ne règle pas au compte, par le refus de la passation", async () => {
    const estimate = await estimator(guard("orders", "active", "none")).execute(
      new EstimateOrderForCustomerQuery("staff_1", payload({ settlement: "account" })),
    );

    expect(estimate.amounts).not.toBeNull();
    expect(estimate.warnings).toEqual([
      {
        code: new AccountSettlementNotGrantedError().code,
        message: new AccountSettlementNotGrantedError().message,
      },
    ]);
  });

  /**
   * Régression : une commande PROGRAMMÉE saisie au comptoir n'envoyait rien
   * qui la distingue, et l'estimation annonçait un lien de règlement que le
   * comptoir n'admet pas (E4 étendu, Hugo, 2026-11-03).
   */
  it("au comptoir, une commande programmée avec un lien : le refus de la passation", async () => {
    const estimate = await estimator(guard("orders", "active", "granted")).execute(
      new EstimateOrderForCustomerQuery(
        "staff_1",
        payload({ settlement: "link", entryOrigin: "counter" }),
      ),
    );

    expect(estimate.refusal?.code).toBe(new CounterLinkSettlementRefusedError().code);
  });

  it("au comptoir, sans paiement différé : l'avertissement dit la cause du comptoir", async () => {
    const estimate = await estimator(guard("orders", "active", "none")).execute(
      new EstimateOrderForCustomerQuery(
        "staff_1",
        payload({ settlement: "account", entryOrigin: "counter" }),
      ),
    );

    const refusal = new CounterAccountSettlementNotGrantedError("terms_not_granted");
    expect(estimate.warnings).toEqual([{ code: refusal.code, message: refusal.message }]);
  });
});

describe("PlaceOrderForCustomerHandler — au comptoir, hors vitrine (E4 étendu)", () => {
  /**
   * Régression : seul le « Retrait immédiat » refusait le lien ; une commande
   * programmée ouverte au comptoir l'acceptait (Hugo, 2026-11-03).
   */
  it("une commande PROGRAMMÉE au comptoir avec un lien est refusée, sans intention", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intents = { intent: null as CreateIntentParams | null };

    await expect(
      handler(guard("orders", "active", "granted"), sink, { payments: payments(intents) }).execute(
        new PlaceOrderForCustomerCommand(
          "staff_1",
          payload({ settlement: "link", entryOrigin: "counter" }),
        ),
      ),
    ).rejects.toBeInstanceOf(CounterLinkSettlementRefusedError);
    expect(intents.intent).toBeNull();
    expect(sink.placed).toBeNull();
  });

  it("hors comptoir, la même commande programmée avec un lien passe", async () => {
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders", "active", "granted"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(result.paymentUrl).toBeDefined();
  });

  it.each([
    // É18 (2026-11-03) : la suspendue se disait « pas actif… tant que son compte n'est pas activé ».
    [
      "suspended",
      "granted",
      "company_suspended",
      /est suspendu : il commande à son tarif, mais réglé immédiatement/u,
    ],
    ["pending", "granted", "company_inactive", /n'est pas actif/u],
    ["active", "none", "terms_not_granted", /paiement différé n'est pas ouvert/u],
    ["active", "blocked", "direct_debit_blocked", /suspendu par la comptabilité/u],
  ] as const)(
    "au compte, société %s / crédit %s : refusé pour la cause %s",
    async (status, standing, reason, words) => {
      const sink = { placed: null as OrderToPlace | null };

      const refusal = handler(guard("orders", status, standing), sink).execute(
        new PlaceOrderForCustomerCommand(
          "staff_1",
          payload({ settlement: "account", entryOrigin: "counter" }),
        ),
      );

      await expect(refusal).rejects.toMatchObject({ reason, code: `orders.counter.${reason}` });
      await expect(refusal).rejects.toThrow(words);
      expect(sink.placed).toBeNull();
    },
  );

  /**
   * Régression É18 (2026-11-03) : une société suspendue était refusée au compte
   * « faute de crédit » — un crédit accordé la laissait même passer au compte,
   * là où son client, dans son espace, ne règle qu'immédiatement (lot P0).
   */
  it("hors comptoir, une société suspendue au crédit accordé est refusée au compte, pour sa suspension", async () => {
    const sink = { placed: null as OrderToPlace | null };

    const refusal = handler(guard("orders", "suspended", "granted"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
    );

    await expect(refusal).rejects.toBeInstanceOf(SuspendedCompanyAccountSettlementError);
    await expect(refusal).rejects.toMatchObject({ code: "orders.settlement.company_suspended" });
    expect(sink.placed).toBeNull();
  });

  it("hors comptoir, une société suspendue passe encore par le lien (son tarif, règlement immédiat)", async () => {
    const sink = { placed: null as OrderToPlace | null };

    const result = await handler(guard("orders", "suspended", "none"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "link" })),
    );

    expect(result.paymentUrl).toBeDefined();
  });

  it("hors comptoir, le refus du compte garde son message « réglez par lien »", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders", "active", "none"), sink).execute(
        new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
      ),
    ).rejects.toThrow(new AccountSettlementNotGrantedError().message);
  });
});

/** Plan `plan-total-vu.md`, T2 : la saisie compare le TTC composé au total que l'estimation a montré. */
describe("PlaceOrderForCustomerHandler — le total vu", () => {
  async function composedTotal(): Promise<number> {
    const sink = { placed: null as OrderToPlace | null };
    await handler(guard("orders", "active", "granted"), sink).execute(
      new PlaceOrderForCustomerCommand("staff_1", payload({ settlement: "account" })),
    );
    return sink.placed?.totalCents ?? Number.NaN;
  }

  it("égal au TTC composé, la commande naît", async () => {
    const total = await composedTotal();
    const sink = { placed: null as OrderToPlace | null };

    await handler(guard("orders", "active", "granted"), sink).execute(
      new PlaceOrderForCustomerCommand(
        "staff_1",
        payload({ settlement: "account", expectedTotalCents: total }),
      ),
    );

    expect(sink.placed?.totalCents).toBe(total);
  });

  it("différent, refuse 409 avec les deux totaux, sans lien ni écriture", async () => {
    const total = await composedTotal();
    const intents = { intent: null as CreateIntentParams | null };
    const sink = { placed: null as OrderToPlace | null };

    const refusal = handler(guard("orders", "active", "granted"), sink, {
      payments: payments(intents),
    }).execute(
      new PlaceOrderForCustomerCommand(
        "staff_1",
        payload({ settlement: "link", expectedTotalCents: total + 1 }),
      ),
    );

    await expect(refusal).rejects.toBeInstanceOf(OrderTotalChangedError);
    await expect(refusal).rejects.toMatchObject({
      facts: { expectedTotalCents: total + 1, totalCents: total },
    });
    expect(intents.intent).toBeNull();
    expect(sink.placed).toBeNull();
  });

  /** L'ordre des refus (`plan-un-seul-assemblage.md`, § 2.4) : 7 bis passe avant 8. */
  it("le total changé se dit AVANT le compte sans crédit", async () => {
    const total = await composedTotal();
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handler(guard("orders", "active", "none"), sink).execute(
        new PlaceOrderForCustomerCommand(
          "staff_1",
          payload({ settlement: "account", expectedTotalCents: total + 1 }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderTotalChangedError);
  });
});
