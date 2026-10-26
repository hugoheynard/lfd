import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedOrderPayers, ownPayers } from "./payer-doubles.js";
import {
  GroupAccountOrderRefusedError,
  OrderPayerNotActiveError,
} from "../../../domain/errors/order-payer-errors.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import type {
  BillingAddressPayload,
  DeliveryZoneView,
  PickupAddressView,
  PlaceOrderPayload,
} from "@lfd/contracts";

import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import {
  PaymentGateway,
  type CreateIntentParams,
} from "../../../../payments/domain/payment-gateway.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
import {
  DeadlineNotRegisteredError,
  DeadlineWindowHasStartError,
  DeliveryClosedForAudienceError,
  FulfillmentWindowRequiredError,
  NoDeliveryZoneForPostalCodeError,
  OrderCompanyNotFoundError,
  PastOrderCutoffError,
  PickupNotConfiguredError,
  TermsNotGrantedError,
} from "../../../domain/errors/order-errors.js";
import { SalesTermsOutdatedError } from "../../../domain/errors/sales-terms-outdated.error.js";
import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { type UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
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
import {
  CompanyStatusReader,
  type OrderCompanyStatus as CompanyStatusOf,
} from "../../../domain/ports/company-status.reader.js";
import {
  DEFAULT_DELIVERY_AVAILABILITY,
  DEFAULT_ORDER_OPENING,
  type DeliveryAvailabilityView,
} from "@lfd/contracts";
import { OrderDrafting } from "../../services/order-drafting.service.js";
import { OrderOperations } from "../../services/order-operations.service.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import type { SaleOperations } from "../../../../catalog/application/sale-operations.service.js";
import {
  catalogItem,
  saleOperationsOver,
} from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import type { SellableOperation } from "../../../../catalog/domain/ports/catalog-operations.reader.js";
import {
  OperationClosedError,
  OperationDayOutsideError,
} from "../../../domain/errors/order-operation-errors.js";
import { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import { OrderIdempotencyStore } from "../../../domain/ports/order-idempotency.store.js";
import { OrderReader } from "../../../domain/ports/order.reader.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { OrderLateFeeReader } from "../../../domain/ports/order-late-fee.reader.js";
import { FixedDeliveryVat } from "./fixed-delivery-vat.js";
import { FixedSalesTerms } from "./fixed-sales-terms.js";
import { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { FixedClosedPlans, gateOf, openPlanGate, RecordingAdmissionDesk } from "./plan-doubles.js";
import { ProductionPlanClosedError } from "../../../domain/errors/production-plan-closed.error.js";
import { SameDayOrderClosedError } from "../../../domain/errors/same-day-order-closed.error.js";
import { OrderLinePricing } from "../../services/order-line-pricing.service.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import { VolumeCommitmentReader } from "../../../../pricing/domain/ports/volume-commitment.reader.js";
import { CustomerVolumeReader } from "../../../../pricing/domain/ports/customer-volume.reader.js";

/**
 * Aucun réglage d'adresse : tout ce que la commande porte y est donc un choix.
 * Les cas de préremplissage sont couverts par `agreed-fulfillment.spec` — ici on
 * exerce le handler, pas la règle de provenance.
 */
/**
 * Un carnet d'adresses MURÉ : ne rend l'adresse que pour la société qui la
 * possède, comme l'adaptateur Prisma (`company_id` dans le `where`).
 */
class WalledAddressBook extends DeliveryDefaultsReader {
  constructor(
    private readonly addressId: string,
    private readonly ownerCompanyId: string,
  ) {
    super();
  }

  of(addressId: string, companyId: string): Promise<DeliveryDefaults> {
    const owned = addressId === this.addressId && companyId === this.ownerCompanyId;
    return Promise.resolve(
      owned ? { ...REGISTERED_WINDOWS, bookAddressId: addressId } : NO_DELIVERY_DEFAULTS,
    );
  }
}

function noDeliveryDefaults(): DeliveryDefaultsReader {
  return { of: (): Promise<DeliveryDefaults> => Promise.resolve(REGISTERED_WINDOWS) };
}

/**
 * Aucun réglage, sauf la fenêtre « avant 10:00 » INSCRITE en créneau comme en
 * échéance : depuis le 2026-10-12, le client ne demande qu'une fenêtre inscrite.
 * `window` reste `null` — rien n'est prérempli, la commande demande.
 */
const REGISTERED_WINDOWS: DeliveryDefaults = {
  ...NO_DELIVERY_DEFAULTS,
  slots: [{ start: null, end: "10:00" }],
  deadlines: ["10:00"],
};
import { PlaceOrderCommand } from "../place-order.command.js";
import { FixedVoucherQuotes, RecordingRedemption, VoucherTakenError } from "./voucher-doubles.js";
import { VoucherNotForCompanyOrderError } from "../../../domain/errors/order-voucher-errors.js";
import { PlaceOrderHandler } from "../place-order.handler.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import type { CatalogPricing, FulfillmentWindow } from "@lfd/contracts";
import { PAINS } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/index.js";
import { RecordingDurable } from "./durable-doubles.js";
import { CustomerCancellationDeadline } from "../../services/customer-cancellation-deadline.js";
import { FixedCancellationSettings } from "./customer-cancellation-doubles.js";
import { intakeAt } from "./intake-doubles.js";
import { OrdersClosedForAudienceError } from "../../../domain/errors/orders-closed-for-audience.error.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";

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
    family: PAINS,
    allergens: null,
    orderTimeLimit: null,
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 200_000,
    vatRate: 0,
  },
  "VIE-002": {
    family: PAINS,
    allergens: null,
    orderTimeLimit: null,
    sku: "VIE-002",
    name: "Pain au chocolat",
    unitPriceMillicents: 220_000,
    vatRate: 0,
  },
};

/**
 * Garde doublée. Le règlement **au compte** est le défaut : la plupart des
 * tests de prix visent une entreprise active, ce qui évite une intention Stripe.
 * Les tests de paiement forcent l'absence de crédit, ou un statut non actif.
 */
function guard(
  role: OrderRole | null,
  status: OrderCompanyStatus | null,
  onAccount: AccountSettlementStanding = "granted",
): OrderGuardReader {
  return {
    roleOf: () => Promise.resolve(role),
    companyStatusOf: () => Promise.resolve(status),
    settlesOnAccount: () => Promise.resolve(onAccount),
  };
}

/** Publisher d'événements doublé : capture ce qui est publié (par extension du port, sans cast). */
/** Fabrique un publisher doublé frais. */
function events(): RecordingPublisher {
  return new RecordingPublisher();
}

/** Passerelle de paiement doublée : capture l'appel `createIntent` (sans réseau). */
function payments(sink: { intent: CreateIntentParams | null } = { intent: null }): PaymentGateway {
  return {
    createIntent: (params) => {
      sink.intent = params;
      return Promise.resolve({ paymentIntentId: "pi_test_1", clientSecret: "pi_test_1_secret" });
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

const catalog = new InMemoryProductCatalog(Object.values(CATALOG));

/** Aucune société n'a de point préféré : un retrait sans choix prend le seul point. */
const noPreferredPickup: PreferredPickupReader = {
  preferredPickupOf: () => Promise.resolve(null),
};

/** Points de retrait doublés : seul le point **résolu** varie. */
/** −20 % sur tout le panier, sans règle — la remise d'avant les exclusions. */
const TWENTY_PERCENT = {
  adjustment: { mode: "percent", bp: 2000 },
  scope: "all_except",
  categories: [],
  products: [],
} as const;

function pickups(resolved: PickupAddressView | null = null): PickupAddressRepository {
  return {
    list: () => Promise.resolve(resolved === null ? [] : [resolved]),
    resolve: () => Promise.resolve(resolved),
  };
}

/**
 * Zones doublées. `resolveForPostalCode` **applique la vraie règle** (un préfixe
 * doit couvrir le code postal) : un double qui renverrait la zone quel que soit
 * le code postal laisserait passer précisément ce qu'on veut interdire — un frais
 * servi par une zone qui ne dessert pas l'adresse livrée.
 */
function zones(found: DeliveryZoneView | null = null): DeliveryZoneRepository {
  return {
    list: () => Promise.resolve(found === null ? [] : [found]),
    findById: () => Promise.resolve(found),
    resolveForPostalCode: (codePostal) =>
      Promise.resolve(
        found !== null && found.postalPrefixes.some((prefix) => codePostal.startsWith(prefix))
          ? found
          : null,
      ),
    create: () => Promise.resolve("zone_1"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
}

/**
 * La composition du panier, montée sur les doubles du test. Le service réel et
 * non un double : c'est LUI qui ré-résout les prix au catalogue et déduit la
 * zone du code postal, et ce sont ces règles-là que les tests ci-dessous
 * vérifient. Le doubler reviendrait à tester le handler contre une fiction.
 */
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

/**
 * Le registre des clés, **toujours libre**.
 *
 * Ce que ces cas éprouvent est la passation, pas l'idempotence — celle-ci a sa
 * propre suite, en e2e, parce que c'est l'index unique de Postgres qui
 * l'arbitre et qu'un double avec une `Map` ne l'aurait jamais montré.
 */
const freeKeys: OrderIdempotencyStore = {
  claim: () => Promise.resolve({ kind: "claimed" as const }),
  release: () => Promise.resolve(),
  resolve: () => Promise.resolve(),
};

/**
 * Aucune commande à relire : ces cas ne passent jamais par le rejeu.
 *
 * 🔴 Écrit **en entier** plutôt que casté depuis `{ findById }`. Un
 * `as unknown as` aurait laissé ce doublé DÉRIVER du port qu'il joue : une
 * méthode ajoutée demain à `OrderReader`, et le cast l'avale — la suite reste
 * verte en jouant un contrat qui n'existe plus. C'est ce que la porte
 * `no-type-escapes` refuse, et elle a raison.
 */
const noReader: OrderReader = {
  listPersonal: () => Promise.resolve([]),
  findById: () => Promise.resolve(null),
  findAuthorByReference: () => Promise.resolve(null),
  findForPacking: () => Promise.reject(new Error("non utilisé")),
  listForProduction: () => Promise.resolve([]),
};

/** L'unité de travail, réduite à ce qu'elle promet ici : exécuter. */
const directWork: UnitOfWork = { run: <T>(work: () => Promise<T>): Promise<T> => work() };

/** Le statut de la société portée, tel que la clientèle le lit. */
function companiesAt(status: CompanyStatusOf | null): CompanyStatusReader {
  return { companyStatusOf: () => Promise.resolve(status) };
}

/** Le réglage de livraison ; par défaut, ligne absente = ouvert aux deux. */
function deliveryAvailability(
  view: DeliveryAvailabilityView = DEFAULT_DELIVERY_AVAILABILITY,
): DeliveryAvailabilityReader {
  return { current: () => Promise.resolve(view) };
}

function drafting(
  pickupsDouble: PickupAddressRepository,
  zonesDouble: DeliveryZoneRepository,
  audience: {
    readonly status?: CompanyStatusOf | null;
    readonly delivery?: DeliveryAvailabilityView;
    readonly sale?: SaleOperations;
    readonly book?: DeliveryDefaultsReader;
    readonly payers?: FixedOrderPayers;
    readonly deliveryVat?: FixedDeliveryVat;
    readonly plans?: OrderPlanGate;
    readonly salesTerms?: FixedSalesTerms;
    readonly cutoffs?: OrderCutoffReader;
    readonly limits?: InMemoryProductCatalog;
    readonly classifications?: FixedLineClassifications;
  } = {},
): OrderDrafting {
  const classifications = audience.classifications ?? new FixedLineClassifications();
  return new OrderDrafting(
    new OrderLinePricing(
      catalog,
      // LA porte du prix, montée sur la seule séquence de chargement du dépôt.
      // L'assembler ici plutôt que d'aligner sept ports dans le constructeur de
      // la caisse est exactement ce que l'extraction a rendu possible.
      new Pricer(
        new PricingMaterialsLoader(
          noPriceRules,
          noMercuriales,
          noPriceFloors,
          noSkuVolumes,
          noVolumeLadders,
          noCommitments,
          noCustomerVolumes,
        ),
        new FixedClock(PRICED_AT),
        noPriceHistory,
        ownPricingParties(),
        new RecordingTimings(),
        new FixedStopwatch(),
      ),
      new FixedClock(PRICED_AT),
    ),
    new CartAdjustments(
      pickupsDouble,
      zonesDouble,
      deliveryAvailability(audience.delivery),
      noPreferredPickup,
      classifications,
    ),
    audience.book ?? noDeliveryDefaults(),
    audience.cutoffs ?? noOrderCutoffs,
    new FixedClock(PRICED_AT),
    audience.limits ?? catalog,
    noWaivers,
    noLateFee,
    new CustomerAudiences(companiesAt(audience.status === undefined ? "active" : audience.status)),
    new OrderOperations(audience.sale ?? noSaleOperations(PRICED_AT)),
    audience.payers ?? ownPayers(),
    audience.deliveryVat ?? new FixedDeliveryVat(),
    audience.plans ?? openPlanGate(),
    audience.salesTerms ?? new FixedSalesTerms(),
    classifications,
  );
}

const LABO_POINT: PickupAddressView = {
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

/** Le snapshot attendu : le point résolu réduit à ses champs postaux. */
const LABO_SNAPSHOT: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
};

/** La seule zone du maillage de test : elle ne dessert que la Tarentaise. */
const TARENTAISE: DeliveryZoneView = {
  id: "z1",
  postalPrefixes: ["73150"],
  label: "Val d'Isère",
  fee: { mode: "amount", cents: 2000 },
};

/** Adresse livrée (coursier) — dans la zone ci-dessus. */
/** Une livraison se commande avec une heure (CA1b) : l'échéance des fixtures coursier. */
const BEFORE_TEN = { start: null, end: "10:00" };

const COURIER_ADDR: BillingAddressPayload = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Repo qui capture ce qu'on lui demande d'écrire, sans base. */
function capturingRepo(sink: { placed: OrderToPlace | null }): OrderRepository {
  return {
    // On capture l'état sérialisé de l'agrégat : les assertions portent sur ce que
    // la commande a réellement calculé (sous-total/TVA/total, lignes, règlement).
    place: (order) => {
      sink.placed = order.toPersistence();
      return Promise.resolve({ id: "order_1", orderNumber: "ORD-TEST" });
    },
    // `null` = aucune ligne n'a franchi — cf. `OrderRepository.markPaid`.
    markPaid: () => Promise.resolve(null),
    markPaymentFailed: () => Promise.resolve(null),
    markFulfilled: () => Promise.reject(new Error("non utilisé")),
    markReady: () => Promise.reject(new Error("non utilisé")),
    absorbIntoPlan: () => Promise.reject(new Error("non utilisé")),
    markAbandoned: () => Promise.reject(new Error("non utilisé")),
    failAtClosing: () => Promise.reject(new Error("non utilisé")),
  };
}

/** Payload par défaut : **retrait**, **sans entreprise** (le chemin zéro friction). */
/** Le créneau que la commande a choisi — obligatoire depuis le 2026-10-14. */
const CHOSEN_WINDOW = { start: "07:00", end: "08:00" };

function payload(over: Partial<PlaceOrderPayload> = {}): PlaceOrderPayload {
  return {
    idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    salesTerms: null,
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: null,
    requestedDeliveryDate: "2026-09-01",
    note: "",
    // Le règlement n'est pas choisi ici : `null` est la valeur que le schéma
    // pose par défaut, et `z.infer` la rend REQUISE à la sortie. L'omettre
    // compilait sous ts-jest et pas sous `tsconfig.test.json` — le payload de
    // ces suites n'était donc pas tout à fait celui que le contrôleur reçoit.
    settlement: null,
    lines: [{ sku: "VIE-001", quantity: 2 }],
    // Le créneau est obligatoire à toute passation (Hugo, 2026-10-14). Les
    // points de ces suites n'ont pas d'heures déclarées : il n'y est pas jugé.
    requestedWindow: CHOSEN_WINDOW,
    ...over,
  };
}

describe("PlaceOrderHandler", () => {
  it.each([
    ["en", "en"],
    [undefined, null],
  ] as const)(
    "fige la langue envoyée (%s → %s), sans en inventer une (lot A3)",
    async (sent, kept) => {
      const sink = { placed: null as OrderToPlace | null };
      const handler = new PlaceOrderHandler(
        guard(null, null),
        drafting(pickups(LABO_POINT), zones()),
        capturingRepo(sink),
        payments(),
        events(),
        noWaivers,
        new FixedClock(PRICED_AT),
        freeKeys,
        noReader,
        directWork,
        new FixedVoucherQuotes(),
        new RecordingRedemption(),
        new RecordingDurable(),
        intakeAt(),
        new CustomerCancellationDeadline(new FixedCancellationSettings()),
      );

      await handler.execute(
        new PlaceOrderCommand("u1", payload(sent === undefined ? {} : { locale: sent }), null),
      );

      expect(sink.placed?.locale).toBe(kept);
    },
  );

  /**
   * Régression (X0, 2026-10-17) : faits du catalogue ouverts, la passation
   * citait la DERNIÈRE version poussée alors que ses lignes venaient des faits —
   * une provenance fausse. Une commande neuve ne fige plus aucune version (Q2).
   */
  it("ne fige plus aucune version de catalogue sur une commande neuve", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload(), null));

    expect(sink.placed?.catalogVersionId).toBeNull();
  });

  /** 2026-10-07 : la livraison l'apprenait par un appel en mémoire, perdu à un redémarrage. */
  it("écrit le fait durable « commande passée » pour la livraison", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const durable = new RecordingDurable();
    const handler = new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      durable,
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload(), null));

    expect(durable.facts).toEqual([new CommerceOrderPlacedFact("order_1").durableFact()]);
  });

  it("publie OrderPlacedEvent après persistance (signal lead chaud)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const published = events();
    const handler = new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      published,
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload(), null));

    expect(published.published).toHaveLength(1);
    const [event] = published.published;
    expect(event).toBeInstanceOf(OrderPlacedEvent);
    const placed = event as OrderPlacedEvent;
    expect(placed.orderId).toBe("order_1");
    expect(placed.placedByUserId).toBe("u1");
    expect(placed.companyId).toBeNull();
    expect(placed.totalCents).toBe(400);
  });

  /**
   * 🔴 **Ce cas garde le chemin HORS requête**, depuis le 2026-09-08.
   *
   * Sur le chemin HTTP, la société vient du contexte, résolu par le guard depuis
   * les rattachements : l'appartenance y est acquise avant d'entrer ici, et ce
   * refus est devenu inatteignable. Il reste vrai — et nécessaire — partout où
   * la société est passée à la main : le semis, un futur travail de fond, ce
   * test. Sans lui, une commande pourrait être écrite sous une maison dont
   * l'acheteur n'est pas.
   *
   * Un 404 et non un 403 : dire « vous n'êtes pas membre » confirmerait que la
   * société existe.
   */
  it("refuse un non-membre quand la société n'est PAS venue des rattachements", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard(null, "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await expect(
      handler.execute(new PlaceOrderCommand("u1", payload(), "c1")),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
    expect(sink.placed).toBeNull();
  });

  it("SANS entreprise, ne vérifie aucun membership et exige une carte (per_order)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    const result = await handler.execute(new PlaceOrderCommand("u1", payload(), null));

    // 2 × 200 = 400, aucun terme d'entreprise → carte, intent sans companyId.
    expect(intentSink.intent).toEqual({ amountCents: 400, currency: "eur", companyId: null });
    expect(sink.placed?.companyId).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(result.payment?.amountCents).toBe(400);
  });

  it("résout les prix au SERVEUR — le prix du client est ignoré", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(
      new PlaceOrderCommand("u1", payload({ lines: [{ sku: "VIE-001", quantity: 3 }] }), "c1"),
    );

    expect(sink.placed?.lines).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceMillicents: 200_000,
        vatRate: 0,
        quantity: 3,
        lineTotalCents: 600,
        // 🔴 Rien de scellé : cette commande porte une SOCIÉTÉ (`"c1"`), donc
        // un professionnel — il récupère la taxe et ne lit que le hors taxe.
        // Lui sceller un TTC créerait un montant que rien n'affiche et que
        // tout pourrait un jour afficher par erreur (R3, 2026-09-21).
        unitPriceTtcCents: null,
        lineTotalTtcCents: null,
        // Aucune remise de retrait, et un catalogue doublé qui ne range rien :
        // éligible, non classée.
        pickupDiscountEligible: true,
        productId: null,
        categoryId: null,
        // Aucune règle dans ces doubles : la trace existe et dit qu'aucun étage
        // n'a joué. C'est une affirmation, pas une absence.
        pricing: {
          basePriceMillicents: 200_000,
          steps: [],
          floored: false,
          // Consigné depuis le 2026-09-09. `false` et non `null` : cette ligne
          // vient d'être résolue, on SAIT que la chaîne n'est pas passée sous
          // zéro. `null` est réservé aux commandes antérieures à la colonne.
          clampedToZero: false,
          // Aucun plancher posé : il n'y a pas d'étage à commenter.
          floorDecision: null,
          // Aucun engagement : le palier s'est joué sur la quantité du panier.
          commitment: null,
          // Même affirmation, sur l'autre moitié de « pourquoi ce prix » : le
          // moteur a regardé et n'a écarté personne. `null` serait réservé aux
          // commandes d'avant la colonne (R25).
          rejected: [],
        },
        // Le catalogue doublé n'en déclare pas : l'absence traverse telle
        // quelle. Un `{ codes: [] }` ici affirmerait « aucun allergène », et
        // cette affirmation partirait figée dans la commande.
        allergens: null,
      },
    ]);
    expect(sink.placed?.subtotalCents).toBe(600);
    expect(sink.placed?.totalCents).toBe(600);
  });

  it("fusionne les lignes en double par SKU", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({
          lines: [
            { sku: "VIE-001", quantity: 2 },
            { sku: "VIE-002", quantity: 1 },
            { sku: "VIE-001", quantity: 3 },
          ],
        }),
        "c1",
      ),
    );

    expect(sink.placed?.lines).toHaveLength(2);
    const croissant = sink.placed?.lines.find((l) => l.sku === "VIE-001");
    expect(croissant?.quantity).toBe(5);
    expect(croissant?.lineTotalCents).toBe(1000);
    expect(sink.placed?.subtotalCents).toBe(1000 + 220);
  });

  it("refuse un SKU inconnu du catalogue (400), sans rien écrire", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand("u1", payload({ lines: [{ sku: "NOPE-999", quantity: 1 }] }), "c1"),
      ),
    ).rejects.toBeInstanceOf(UnknownSkuError);
    expect(sink.placed).toBeNull();
  });

  it("en RETRAIT, fige l'adresse du point et son site, et n'attache ni zone ni adresse de livraison", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));

    expect(sink.placed?.fulfillmentMethod).toBe("pickup");
    expect(sink.placed?.deliveryZoneId).toBeNull();
    expect(sink.placed?.deliveryAddress).toBeNull();
    // Le site qui remet est figé avec le point (lot S2) : l'id du point résolu.
    expect(sink.placed?.pickupAddress).toEqual({ ...LABO_SNAPSHOT, siteId: LABO_POINT.id });
  });

  it("refuse le RETRAIT quand aucun point de retrait n'est configuré (409)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(null), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await expect(
      handler.execute(new PlaceOrderCommand("u1", payload(), "c1")),
    ).rejects.toBeInstanceOf(PickupNotConfiguredError);
    expect(sink.placed).toBeNull();
  });

  it("en RETRAIT, applique la remise du point au total", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const point: PickupAddressView = {
      ...LABO_POINT,
      discounts: { b2b: TWENTY_PERCENT, b2c: TWENTY_PERCENT },
    };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(point), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    // 2 × 200 = 400 ; remise 20 % = 80 ; total = 320.
    await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));

    expect(sink.placed?.subtotalCents).toBe(400);
    expect(sink.placed?.discountCents).toBe(80);
    expect(sink.placed?.deliveryFeeCents).toBe(0);
    expect(sink.placed?.totalCents).toBe(320);
  });

  /**
   * Plan `remise-et-livraison-par-clientele`, Q3 : une société qui n'est pas
   * ACTIVE suit les règles B2C. Une remise réservée aux pros ne s'obtient pas en
   * déclarant une société.
   */
  /**
   * Plan `plan-remise-retrait-par-clientele-et-exclusions.md`, R1 et R2 : la
   * remise ne porte que sur les lignes qu'elle couvre, et chaque ligne fige
   * son drapeau, son produit et sa famille.
   */
  it("en RETRAIT, remise les seules lignes couvertes et fige leur éligibilité", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const point: PickupAddressView = {
      ...LABO_POINT,
      discounts: {
        b2b: { ...TWENTY_PERCENT, products: [{ productId: "p_pain_choc", eligible: false }] },
        b2c: null,
      },
    };
    const classifications = new FixedLineClassifications({
      "VIE-001": { productId: "p_croissant", categoryId: "c_vie", categoryPath: ["c_vie"] },
      "VIE-002": { productId: "p_pain_choc", categoryId: "c_vie", categoryPath: ["c_vie"] },
    });
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(point), zones(), { classifications }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
    const lines = [
      { sku: "VIE-001", quantity: 2 },
      { sku: "VIE-002", quantity: 1 },
    ];

    // 400 éligibles + 220 exclus ; remise 20 % de 400 = 80 ; total = 540.
    await handler.execute(new PlaceOrderCommand("u1", payload({ lines }), "c1"));

    expect(sink.placed?.subtotalCents).toBe(620);
    expect(sink.placed?.discountCents).toBe(80);
    expect(sink.placed?.totalCents).toBe(540);
    expect(
      sink.placed?.lines.map((line) => [line.sku, line.pickupDiscountEligible, line.productId]),
    ).toEqual([
      ["VIE-001", true, "p_croissant"],
      ["VIE-002", false, "p_pain_choc"],
    ]);
    // Une lecture, pas deux : la passation donne au service ce qu'elle a lu.
    expect(classifications.asked).toHaveLength(1);
  });

  it("en RETRAIT, ne remise pas une société en attente quand la remise est réservée aux pros", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const point: PickupAddressView = {
      ...LABO_POINT,
      discounts: { b2b: TWENTY_PERCENT, b2c: null },
    };
    const handler = new PlaceOrderHandler(
      guard("orders", "pending", "none"),
      drafting(pickups(point), zones(), { status: "pending" }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));

    expect(sink.placed?.discountCents).toBe(0);
    expect(sink.placed?.discountAdjustment).toBeNull();
    expect(sink.placed?.totalCents).toBe(400);
  });

  it("en COURSIER, refuse la livraison fermée aux particuliers pour une commande perso, sans rien écrire", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard(null, null, "none"),
      drafting(pickups(), zones(TARENTAISE), {
        delivery: { ...DEFAULT_DELIVERY_AVAILABILITY, openToB2c: false },
      }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({ fulfillmentMethod: "delivery", deliveryAddress: COURIER_ADDR }),
          null,
        ),
      ),
    ).rejects.toBeInstanceOf(DeliveryClosedForAudienceError);
    expect(sink.placed).toBeNull();
  });

  it("en COURSIER, fige l'adresse livrée et déduit le frais de SON code postal", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(), zones(TARENTAISE)),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    // 2 × 200 = 400 HT (TVA 0 dans ce catalogue de test) ; frais 20 € = 2000 HT
    // + TVA livraison 20 % = 400 ; total TTC = 400 + 2000 + 400 = 2800.
    await handler.execute(
      // La société est le TROISIÈME argument depuis qu'elle a quitté le
      // payload : le client ne la choisit plus, le handler la reçoit du mur.
      // Ces deux appels ne l'avaient pas suivi — sans conséquence à
      // l'exécution, `companyId` en trop étant ignoré, mais le cas ne testait
      // plus une commande d'entreprise. `tsconfig.test.json` l'a dit.
      new PlaceOrderCommand(
        "u1",
        payload({
          fulfillmentMethod: "delivery",
          deliveryAddress: COURIER_ADDR,
          // Une adresse du carnet : seule elle inscrit la fenêtre demandée (2026-10-12).
          deliveryAddressId: "addr_c1",
          requestedWindow: BEFORE_TEN,
        }),
        "c1",
      ),
    );

    expect(sink.placed?.deliveryZoneId).toBe("z1");
    expect(sink.placed?.deliveryAddress).toEqual(COURIER_ADDR);
    expect(sink.placed?.pickupAddress).toBeNull();
    expect(sink.placed?.subtotalCents).toBe(400);
    expect(sink.placed?.deliveryFeeCents).toBe(2000);
    expect(sink.placed?.vatCents).toBe(400);
    expect(sink.placed?.totalCents).toBe(2800);
  });

  /**
   * Plan TVA des frais de port, V3 : la passation LIT le réglage, le passe au
   * calcul et le fige. Le catalogue de test est à 0 % : un port qui suit la
   * marchandise n'y porte donc aucune TVA.
   */
  it("en COURSIER, lit le mode de TVA du port, le fige et taxe le port au taux des marchandises", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const deliveryVat = new FixedDeliveryVat("follows_goods");
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(), zones(TARENTAISE), { deliveryVat }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({
          fulfillmentMethod: "delivery",
          deliveryAddress: COURIER_ADDR,
          // Une adresse du carnet : seule elle inscrit la fenêtre demandée (2026-10-12).
          deliveryAddressId: "addr_c1",
          requestedWindow: BEFORE_TEN,
        }),
        "c1",
      ),
    );

    expect(deliveryVat.reads).toBe(1);
    expect(sink.placed?.deliveryVatMode).toBe("follows_goods");
    expect(sink.placed?.vatCents).toBe(0);
    expect(sink.placed?.totalCents).toBe(2400);
  });

  describe("le lien vers le carnet d'adresses", () => {
    async function placeDeliveryFor(companyId: string): Promise<OrderToPlace | null> {
      const sink = { placed: null as OrderToPlace | null };
      const handler = new PlaceOrderHandler(
        guard("orders", "active"),
        drafting(pickups(), zones(TARENTAISE), {
          book: new WalledAddressBook("addr_c1", "c1"),
        }),
        capturingRepo(sink),
        payments(),
        events(),
        noWaivers,
        new FixedClock(PRICED_AT),
        freeKeys,
        noReader,
        directWork,
        new FixedVoucherQuotes(),
        new RecordingRedemption(),
        new RecordingDurable(),
        intakeAt(),
        new CustomerCancellationDeadline(new FixedCancellationSettings()),
      );
      await handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({
            fulfillmentMethod: "delivery",
            deliveryAddress: COURIER_ADDR,
            deliveryAddressId: "addr_c1",
            requestedWindow: BEFORE_TEN,
          }),
          companyId,
        ),
      );
      return sink.placed;
    }

    /**
     * Régression : `orders.delivery_address_id` n'était écrit par RIEN, et la
     * feuille de route ne pouvait atteindre ni la procédure ni la note de
     * l'adresse livrée (constaté le 2026-09-29).
     */
    it("🔴 écrit le lien quand l'adresse est dans le carnet de la société", async () => {
      expect((await placeDeliveryFor("c1"))?.deliveryAddressId).toBe("addr_c1");
    });

    /**
     * Jusqu'au 2026-10-12 la commande passait sans le lien. Depuis que le client
     * ne demande qu'une fenêtre inscrite, l'adresse d'une autre maison n'apporte
     * aucune fenêtre : la commande est refusée, et aucun lien n'est écrit.
     */
    it("🔴 n'écrit PAS le lien vers l'adresse d'une autre société — la commande est refusée", async () => {
      await expect(placeDeliveryFor("c2")).rejects.toThrow(DeadlineNotRegisteredError);
    });
  });

  it("refuse le COURSIER vers un code postal qu'AUCUNE zone ne dessert, sans rien écrire", async () => {
    // Un secteur non couvert n'est pas un secteur gratuit : c'est un secteur où
    // la tournée n'a pas de coût connu. On refuse plutôt que de livrer à 0 €.
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(), zones(TARENTAISE)),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({
            fulfillmentMethod: "delivery",
            deliveryAddress: { ...COURIER_ADDR, codePostal: "75002", ville: "Paris" },
          }),
          "c1",
        ),
      ),
    ).rejects.toBeInstanceOf(NoDeliveryZoneForPostalCodeError);
    expect(sink.placed).toBeNull();
  });

  it("en PER_ORDER, crée une intention Stripe du total, marque pending et renvoie le clientSecret", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active", "none"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    const result = await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));

    expect(intentSink.intent).toEqual({ amountCents: 400, currency: "eur", companyId: "c1" });
    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(sink.placed?.stripePaymentIntentId).toBe("pi_test_1");
    expect(result.settlement).toBe("due");
    expect(result.payment).toEqual({
      clientSecret: "pi_test_1_secret",
      publishableKey: "pk_test_123",
      amountCents: 400,
    });
  });

  it("en terme différé (mensuel) sur entreprise active, ne crée AUCUNE intention et marque not_required", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    const result = await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));

    expect(intentSink.intent).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(sink.placed?.stripePaymentIntentId).toBeNull();
    expect(result.payment).toBeUndefined();
    // F5 : la confirmation lit ce régime pour ne montrer que le HT.
    expect(result.settlement).toBe("account");
  });

  it("entreprise NON active (pending) : carte requise malgré un terme différé", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "pending"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));

    expect(intentSink.intent?.amountCents).toBe(400);
    expect(sink.placed?.paymentStatus).toBe("pending");
  });
});

/**
 * D6 du plan des opérations datées : le garde s'applique à la passation, APRÈS
 * le délai de fabrication, pour la clientèle de la commande (ici sans société,
 * donc `public`). Dates comparées à `PRICED_AT`, l'horloge figée du test.
 */
describe("PlaceOrderHandler — un article d'opération datée", () => {
  function galette(over: Partial<SellableOperation> = {}): SellableOperation {
    return {
      key: "galette",
      name: { fr: "Galette" },
      lede: null,
      image: null,
      announceFrom: new Date("2026-01-01T00:00:00.000Z"),
      orderFrom: null,
      orderUntil: new Date("2026-01-20T11:00:00.000Z"),
      pickupFrom: "2026-01-24",
      pickupUntil: "2026-01-25",
      audience: "both",
      skus: ["VIE-001-1"],
      ...over,
    };
  }

  function handlerOver(operation: SellableOperation, sink: { placed: OrderToPlace | null }) {
    const sale = saleOperationsOver({
      now: PRICED_AT,
      operations: [operation],
      items: [catalogItem("VIE-001")],
      onlySkus: ["VIE-001-1"],
    });
    return new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones(), { sale }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
  }

  it("passe pour un jour de retrait de l'opération, commande ouverte", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await handlerOver(galette(), sink).execute(
      new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: "2026-01-24" }), null),
    );

    expect(sink.placed).not.toBeNull();
  });

  it("refuse un jour hors des jours de retrait, et n'écrit rien", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await expect(
      handlerOver(galette(), sink).execute(
        new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: "2026-01-26" }), null),
      ),
    ).rejects.toBeInstanceOf(OperationDayOutsideError);
    expect(sink.placed).toBeNull();
  });

  it("refuse une opération close, même pour un jour de retrait", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const closed = galette({ orderUntil: new Date("2026-01-10T11:00:00.000Z") });

    await expect(
      handlerOver(closed, sink).execute(
        new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: "2026-01-24" }), null),
      ),
    ).rejects.toBeInstanceOf(OperationClosedError);
    expect(sink.placed).toBeNull();
  });

  it("laisse passer un article courant de l'opération après sa clôture (le croissant du 26)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const sale = saleOperationsOver({
      now: PRICED_AT,
      operations: [galette({ orderUntil: new Date("2026-01-10T11:00:00.000Z") })],
      items: [catalogItem("VIE-001")],
      onlySkus: [],
    });
    const handler = new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones(), { sale }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );

    await handler.execute(
      new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: "2026-01-26" }), null),
    );

    expect(sink.placed).not.toBeNull();
  });
});

/**
 * Le prélèvement **bloqué** par la comptabilité (plan « blocage du
 * prélèvement », §1) : le crédit reste accordé, mais la commande ne se porte
 * plus au compte.
 */
describe("PlaceOrderHandler — prélèvement bloqué", () => {
  function blockedHandler(
    standing: AccountSettlementStanding,
    sink: { placed: OrderToPlace | null },
    intentSink: { intent: CreateIntentParams | null },
  ): PlaceOrderHandler {
    return new PlaceOrderHandler(
      guard("orders", "active", standing),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
  }

  it("REFUSE « au compte » en nommant la suspension, sans rien enregistrer", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };

    const refusal = blockedHandler("blocked", sink, intentSink).execute(
      new PlaceOrderCommand("u1", payload({ settlement: "account" }), "c1"),
    );

    await expect(refusal).rejects.toBeInstanceOf(TermsNotGrantedError);
    await expect(refusal).rejects.toThrow(/suspendu/u);
    expect(sink.placed).toBeNull();
    expect(intentSink.intent).toBeNull();
  });

  it("sans mode choisi, bascule sur la carte en silence", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };

    await blockedHandler("blocked", sink, intentSink).execute(
      new PlaceOrderCommand("u1", payload(), "c1"),
    );

    expect(intentSink.intent).not.toBeNull();
    expect(sink.placed?.paymentStatus).toBe("pending");
  });

  it("par carte demandée, passe comme avant", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };

    await blockedHandler("blocked", sink, intentSink).execute(
      new PlaceOrderCommand("u1", payload({ settlement: "card" }), "c1"),
    );

    expect(sink.placed?.paymentStatus).toBe("pending");
  });

  it("sans crédit du tout, le refus ne parle PAS de suspension", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };

    const refusal = blockedHandler("none", sink, intentSink).execute(
      new PlaceOrderCommand("u1", payload({ settlement: "account" }), "c1"),
    );

    await expect(refusal).rejects.toThrow(/Aucun terme de paiement/u);
  });

  it("crédit accordé et non bloqué : « au compte » passe sans intention", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };

    await blockedHandler("granted", sink, intentSink).execute(
      new PlaceOrderCommand("u1", payload({ settlement: "account" }), "c1"),
    );

    expect(intentSink.intent).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("not_required");
  });
});

/**
 * Le bon de fidélité à la passation (plan des points, C3, C5) : lu avant de
 * chiffrer, réservé DANS la transaction avant l'écriture de la commande, soldé
 * sur-le-champ quand la commande n'a rien à encaisser. Le panier de ces cas
 * vaut 2 × 200 = 400 HT, sans TVA.
 */
describe("PlaceOrderHandler — le bon de fidélité", () => {
  function voucherHandler(over: {
    readonly sink: { placed: OrderToPlace | null };
    readonly redemption: RecordingRedemption;
    readonly cancelled?: string[];
    readonly role?: OrderRole | null;
    readonly status?: OrderCompanyStatus | null;
  }): PlaceOrderHandler {
    const cancelled = over.cancelled ?? [];
    const gateway = payments();
    return new PlaceOrderHandler(
      guard(over.role ?? null, over.status ?? null),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(over.sink),
      {
        createIntent: (params) => gateway.createIntent(params),
        retrieveIntent: (id) => gateway.retrieveIntent(id),
        publishableKey: () => gateway.publishableKey(),
        parseWebhook: (body, signature) => gateway.parseWebhook(body, signature),
        cancelIntent: (paymentIntentId) => {
          cancelled.push(paymentIntentId);
          return Promise.resolve({ kind: "cancelled" });
        },
      },
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes({ v150: 150, v500: 500 }),
      over.redemption,
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
  }

  it("déduit le bon du total, le réserve, et ne solde rien tant que la carte n'a pas payé", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const redemption = new RecordingRedemption();

    const result = await voucherHandler({ sink, redemption }).execute(
      new PlaceOrderCommand("u1", payload({ voucherId: "v150" }), null),
    );

    expect(sink.placed?.voucherDiscountCents).toBe(150);
    expect(sink.placed?.loyaltyVoucherId).toBe("v150");
    expect(sink.placed?.totalCents).toBe(250);
    expect(result.payment?.amountCents).toBe(250);
    expect(redemption.calls).toEqual(["reserve:v150>u1"]);
  });

  it("un bon plus gros que le panier : total nul, sans intention, reliquat soldé à la passation", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const redemption = new RecordingRedemption();

    const result = await voucherHandler({ sink, redemption }).execute(
      new PlaceOrderCommand("u1", payload({ voucherId: "v500" }), null),
    );

    expect(sink.placed?.totalCents).toBe(0);
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(result.payment).toBeUndefined();
    // Un total nul n'est pas « au compte » : la confirmation garde son TTC.
    expect(result.settlement).toBe("free");
    expect(redemption.calls).toEqual(["reserve:v500>u1", "settle:v500"]);
    expect(redemption.settlements[0]).toEqual({
      voucherId: "v500",
      appliedCents: 400,
      order: { id: "order_1", number: "ORD-TEST" },
    });
  });

  it("une course perdue à la réservation : rien d'écrit, l'intention Stripe est annulée", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const cancelled: string[] = [];

    await expect(
      voucherHandler({ sink, redemption: new RecordingRedemption(true), cancelled }).execute(
        new PlaceOrderCommand("u1", payload({ voucherId: "v150" }), null),
      ),
    ).rejects.toBeInstanceOf(VoucherTakenError);

    expect(sink.placed).toBeNull();
    expect(cancelled).toEqual(["pi_test_1"]);
  });

  it("refuse un bon sur une commande de société, sans rien réserver", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const redemption = new RecordingRedemption();

    await expect(
      voucherHandler({ sink, redemption, role: "orders", status: "active" }).execute(
        new PlaceOrderCommand("u1", payload({ voucherId: "v150" }), "c1"),
      ),
    ).rejects.toBeInstanceOf(VoucherNotForCompanyOrderError);

    expect(redemption.calls).toEqual([]);
    expect(sink.placed).toBeNull();
  });
});

/**
 * Créneau ou échéance (plan composition automatique, CA-D2) et livraison sans
 * fenêtre refusée (CA1b), au travers de la vraie passation.
 */
describe("PlaceOrderHandler — créneau ou échéance", () => {
  /** Une adresse du carnet de `c1`, avec son mode et ses échéances. */
  class BookWithDeadlines extends DeliveryDefaultsReader {
    constructor(private readonly specs: Partial<DeliveryDefaults>) {
      super();
    }

    of(addressId: string): Promise<DeliveryDefaults> {
      return Promise.resolve({ ...NO_DELIVERY_DEFAULTS, bookAddressId: addressId, ...this.specs });
    }
  }

  async function place(
    window: FulfillmentWindow | null | undefined,
    options: { readonly global?: "slot" | "deadline"; readonly book?: DeliveryDefaultsReader } = {},
  ): Promise<OrderToPlace | null> {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(), zones(TARENTAISE), {
        delivery: { ...DEFAULT_DELIVERY_AVAILABILITY, windowMode: options.global ?? "slot" },
        ...(options.book === undefined ? {} : { book: options.book }),
      }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({
          fulfillmentMethod: "delivery",
          deliveryAddress: COURIER_ADDR,
          deliveryAddressId: "addr_c1",
          requestedWindow: window,
        }),
        "c1",
      ),
    );
    return sink.placed;
  }

  it("en échéance globale, fige une fenêtre sans début", async () => {
    const placed = await place(BEFORE_TEN, { global: "deadline" });

    expect(placed?.agreed.window.value).toEqual(BEFORE_TEN);
  });

  it("en échéance globale, refuse un début fourni — rien n'est écrit", async () => {
    await expect(place({ start: "08:00", end: "10:00" }, { global: "deadline" })).rejects.toThrow(
      DeadlineWindowHasStartError,
    );
  });

  /** CA1b : une livraison sans heure ne se place dans aucune tournée. */
  it("refuse une livraison sans fenêtre", async () => {
    await expect(place(undefined)).rejects.toThrow(FulfillmentWindowRequiredError);
    await expect(place(null, { global: "deadline" })).rejects.toThrow(
      FulfillmentWindowRequiredError,
    );
  });

  it("la surcharge d'adresse l'emporte sur le global", async () => {
    const book = new BookWithDeadlines({ windowMode: "deadline" });

    await expect(place({ start: "08:00", end: "10:00" }, { global: "slot", book })).rejects.toThrow(
      DeadlineWindowHasStartError,
    );
  });

  /** Décision Hugo du 2026-10-12 : « une autre heure » n'existe plus côté client. */
  it("une échéance de la liste de l'adresse est une reprise, une autre heure est refusée", async () => {
    const book = new BookWithDeadlines({ windowMode: "deadline", deadlines: ["06:00", "11:00"] });

    const listed = await place({ start: null, end: "11:00" }, { book });

    expect(listed?.agreed.window.source).toBe("default");
    await expect(place({ start: null, end: "09:00" }, { book })).rejects.toThrow(
      DeadlineNotRegisteredError,
    );
  });

  /**
   * Décision Hugo du 2026-10-14 : la seule échéance de l'adresse était reprise
   * en silence quand la commande ne disait rien ; elle doit être CHOISIE.
   */
  it("une échéance préférée unique n'est plus reprise quand la commande ne dit rien", async () => {
    const book = new BookWithDeadlines({ windowMode: "deadline", deadlines: ["06:00"] });

    await expect(place(undefined, { book })).rejects.toThrow(FulfillmentWindowRequiredError);
    const chosen = await place({ start: null, end: "06:00" }, { book });
    expect(chosen?.agreed.window).toEqual({
      value: { start: null, end: "06:00" },
      source: "default",
    });
  });

  it("plusieurs échéances préférées ne se choisissent pas à la place du client", async () => {
    const book = new BookWithDeadlines({ windowMode: "deadline", deadlines: ["06:00", "11:00"] });

    await expect(place(undefined, { book })).rejects.toThrow(FulfillmentWindowRequiredError);
  });
});

/**
 * S4 (`sous-comptes.md` §2.3, §2.4, T44) : un site qui suit `billing`
 * commande au compte de son PRINCIPAL. Le payeur est copié sur la commande,
 * et ce sont les termes du payeur qui décident du règlement au compte.
 */
describe("PlaceOrderHandler — un site facturé à son principal", () => {
  const SITE = {
    companyId: "chalet",
    companyName: "Chalet Edelweiss",
    groupWithoutDelivery: false,
  } as const;

  function siteHandler(
    payers: FixedOrderPayers,
    sink: { placed: OrderToPlace | null },
    asked: string[],
  ): PlaceOrderHandler {
    // Seul le principal a un crédit : le site n'a rien d'accordé à son nom.
    const payerGuard: OrderGuardReader = {
      roleOf: () => Promise.resolve("orders"),
      companyStatusOf: () => Promise.resolve("active"),
      settlesOnAccount: (companyId) => {
        asked.push(companyId);
        return Promise.resolve(companyId === "alpes" ? "granted" : "none");
      },
    };
    return new PlaceOrderHandler(
      payerGuard,
      drafting(pickups(LABO_POINT), zones(), { payers }),
      capturingRepo(sink),
      payments({ intent: null }),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
  }

  function following(status: OrderCompanyStatus): FixedOrderPayers {
    return new FixedOrderPayers(
      new Map([
        [
          "chalet",
          {
            ...SITE,
            billingFollow: {
              payerId: "alpes",
              payerName: "Alpes Chalets Privés",
              payerStatus: status,
            },
            principalId: "alpes",
            followsPricing: false,
          },
        ],
      ]),
    );
  }

  it("copie le principal sur la commande et lit SES termes pour le compte", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const asked: string[] = [];
    const payers = following("active");

    await siteHandler(payers, sink, asked).execute(
      new PlaceOrderCommand("u1", payload({ settlement: "account" }), "chalet"),
    );

    expect(sink.placed?.companyId).toBe("chalet");
    expect(sink.placed?.billedCompanyId).toBe("alpes");
    // Le principal est copié avec le payeur, et voit le montant : le site suit `billing`.
    expect(sink.placed?.principalCompanyId).toBe("alpes");
    expect(sink.placed?.principalSeesAmount).toBe(true);
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(asked).toEqual(["alpes"]);
    // Le payeur est lu à l'instant de la passation, pas à une date choisie par l'appelant.
    expect(payers.asked).toEqual([{ companyId: "chalet", at: PRICED_AT }]);
  });

  it("copie la société elle-même quand elle paie seule", async () => {
    const sink = { placed: null as OrderToPlace | null };

    await siteHandler(ownPayers(), sink, []).execute(
      new PlaceOrderCommand("u1", payload({ settlement: "card" }), "chalet"),
    );

    expect(sink.placed?.billedCompanyId).toBe("chalet");
    // Sans principal, rien à copier — et rien à dire du montant.
    expect(sink.placed?.principalCompanyId).toBeNull();
    expect(sink.placed?.principalSeesAmount).toBeNull();
  });

  it("refuse un site dont le principal est suspendu, en le nommant, sans rien écrire (Q4)", async () => {
    const sink = { placed: null as OrderToPlace | null };

    const refusal = siteHandler(following("suspended"), sink, []).execute(
      new PlaceOrderCommand("u1", payload({ settlement: "account" }), "chalet"),
    );

    await expect(refusal).rejects.toBeInstanceOf(OrderPayerNotActiveError);
    await expect(refusal).rejects.toThrow(/Alpes Chalets Privés/u);
    expect(sink.placed).toBeNull();
  });

  it("refuse une commande au nom d'un compte de groupe sans livraison", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const group = new FixedOrderPayers(
      new Map([
        [
          "cimes",
          {
            companyId: "cimes",
            companyName: "Groupe Hôtelier des Cimes",
            groupWithoutDelivery: true,
            billingFollow: null,
            principalId: null,
            followsPricing: false,
          },
        ],
      ]),
    );

    const refusal = siteHandler(group, sink, []).execute(
      new PlaceOrderCommand("u1", payload(), "cimes"),
    );

    await expect(refusal).rejects.toBeInstanceOf(GroupAccountOrderRefusedError);
    expect(sink.placed).toBeNull();
  });
});

/**
 * L'ouverture de la boutique (Hugo, 2026-10-09) : fermée à une clientèle, la
 * passation de cette clientèle est refusée en 409 avant toute écriture ; celle
 * de l'autre passe. La clientèle se déduit de la société, comme la remise.
 */
describe("PlaceOrderHandler — la boutique fermée à une clientèle", () => {
  function closedTo(
    opening: { readonly ordersOpenToB2b: boolean; readonly ordersOpenToB2c: boolean },
    sink: { placed: OrderToPlace | null },
  ): PlaceOrderHandler {
    return new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(opening, "active"),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
  }

  it("refuse la commande d'un pro quand la boutique est fermée aux pros, sans rien écrire", async () => {
    const sink: { placed: OrderToPlace | null } = { placed: null };
    const handler = closedTo({ ordersOpenToB2b: false, ordersOpenToB2c: true }, sink);

    const refusal = handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));

    await expect(refusal).rejects.toBeInstanceOf(OrdersClosedForAudienceError);
    await expect(refusal).rejects.toThrow("ne prend pas de commandes des pros");
    expect(sink.placed).toBeNull();
  });

  it("laisse passer un particulier connecté quand seule la boutique pro est fermée", async () => {
    const sink: { placed: OrderToPlace | null } = { placed: null };
    const handler = closedTo({ ordersOpenToB2b: false, ordersOpenToB2c: true }, sink);

    await handler.execute(new PlaceOrderCommand("u1", payload(), null));

    expect(sink.placed).not.toBeNull();
  });

  it("refuse un particulier connecté quand la boutique est fermée aux particuliers", async () => {
    const sink: { placed: OrderToPlace | null } = { placed: null };
    const handler = closedTo({ ordersOpenToB2b: true, ordersOpenToB2c: false }, sink);

    await expect(handler.execute(new PlaceOrderCommand("u1", payload(), null))).rejects.toThrow(
      "ne prend pas de commandes des particuliers",
    );
    expect(sink.placed).toBeNull();

    await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));
    expect(sink.placed).not.toBeNull();
  });
});

/**
 * **L'arrêt du plan est une limite** (lot O3 de `plan-reglages-commandes.md`,
 * 2026-10-14). Régression O5 : une commande passait sur un plan arrêté, hors
 * du compte à produire, sans que personne le sache.
 */
describe("PlaceOrderHandler — l'arrêt du plan", () => {
  const DAY = "2026-09-01";

  function planHandler(over: {
    readonly sink: { placed: OrderToPlace | null };
    readonly plans: OrderPlanGate;
    readonly intents?: { intent: CreateIntentParams | null };
    readonly cancelled?: string[];
  }): PlaceOrderHandler {
    const gateway = payments(over.intents);
    const cancelled = over.cancelled ?? [];
    return new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones(), { plans: over.plans }),
      capturingRepo(over.sink),
      {
        createIntent: (params) => gateway.createIntent(params),
        retrieveIntent: (id) => gateway.retrieveIntent(id),
        publishableKey: () => gateway.publishableKey(),
        parseWebhook: (body, signature) => gateway.parseWebhook(body, signature),
        cancelIntent: (paymentIntentId) => {
          cancelled.push(paymentIntentId);
          return Promise.resolve({ kind: "cancelled" });
        },
      },
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
  }

  it("refuse une journée au plan arrêté AVANT l'intention Stripe, sans rien écrire", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intents = { intent: null as CreateIntentParams | null };
    const desk = new RecordingAdmissionDesk([DAY]);
    const plans = gateOf(new FixedClosedPlans([DAY]), desk);

    await expect(
      planHandler({ sink, plans, intents }).execute(
        new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: DAY }), null),
      ),
    ).rejects.toBeInstanceOf(ProductionPlanClosedError);

    expect(intents.intent).toBeNull();
    expect(sink.placed).toBeNull();
    expect(desk.held).toEqual([]);
  });

  it("arrêté entre la composition et l'écriture : refusé sous le verrou, intention annulée", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const cancelled: string[] = [];
    const plans = gateOf(new FixedClosedPlans(), new RecordingAdmissionDesk([DAY]));

    await expect(
      planHandler({ sink, plans, cancelled }).execute(
        new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: DAY }), null),
      ),
    ).rejects.toBeInstanceOf(ProductionPlanClosedError);

    expect(sink.placed).toBeNull();
    expect(cancelled).toEqual(["pi_test_1"]);
  });

  it("tient la journée AVANT d'écrire la commande, dans la transaction", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const writtenWhenHeld: boolean[] = [];
    const desk = new RecordingAdmissionDesk([], () => writtenWhenHeld.push(sink.placed !== null));

    await planHandler({
      sink,
      plans: gateOf(new FixedClosedPlans(), desk),
    }).execute(new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: DAY }), null));

    expect(desk.held).toEqual([DAY]);
    expect(writtenWhenHeld).toEqual([false]);
    expect(sink.placed).not.toBeNull();
  });

  it("le jour même, fermé par le réglage : refusé au client avant l'intention", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intents = { intent: null as CreateIntentParams | null };

    await expect(
      planHandler({ sink, plans: gateOf(), intents }).execute(
        new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: "2026-01-01" }), null),
      ),
    ).rejects.toBeInstanceOf(SameDayOrderClosedError);
    expect(intents.intent).toBeNull();
  });

  it("le jour même, ouvert par le réglage : la commande passe", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const plans = gateOf(new FixedClosedPlans(), new RecordingAdmissionDesk(), true);

    await planHandler({ sink, plans }).execute(
      new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: "2026-01-01" }), null),
    );

    expect(sink.placed?.placedOffPlan).toBe(false);
  });
});

/**
 * Les CGV figées à la passation (plan `legal/plan-cgv-par-audience.md`, C4′) :
 * celles de l'audience qui TARIFE la commande (`audienceOf`), lues au port.
 */
describe("PlaceOrderHandler — les CGV en vigueur", () => {
  async function placeAs(
    status: "active" | "pending",
    salesTerms: FixedSalesTerms,
  ): Promise<OrderToPlace | null> {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("orders", status),
      drafting(pickups(LABO_POINT), zones(), { status, salesTerms }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
    await handler.execute(new PlaceOrderCommand("u1", payload(), "c1"));
    return sink.placed;
  }

  it("une société ACTIVE porte les CGV pro, révision et PDF en vigueur", async () => {
    const salesTerms = new FixedSalesTerms({
      salesTermsPro: { revision: 4, fileId: "ldf_pro_1" },
      salesTerms: { revision: 9, fileId: "ldf_part_1" },
    });

    const placed = await placeAs("active", salesTerms);

    expect(salesTerms.asked).toEqual(["salesTermsPro"]);
    expect(placed?.salesTerms).toEqual({
      document: "salesTermsPro",
      revision: 4,
      fileId: "ldf_pro_1",
    });
  });

  /**
   * C2″ : une société en attente paie les prix des particuliers — elle est
   * liée par leurs CGV, pas par celles des pros.
   */
  it("une société EN ATTENTE porte les CGV particuliers", async () => {
    const salesTerms = new FixedSalesTerms({ salesTerms: { revision: 9, fileId: null } });

    const placed = await placeAs("pending", salesTerms);

    expect(placed?.salesTerms).toEqual({ document: "salesTerms", revision: 9, fileId: null });
  });

  it("des CGV pro jamais rédigées : le texte est figé, révision et PDF nuls", async () => {
    const placed = await placeAs("active", new FixedSalesTerms());

    expect(placed?.salesTerms).toEqual({ document: "salesTermsPro", revision: null, fileId: null });
  });
});

/**
 * La case du panier (2026-10-26) : le client coche la version en vigueur pour
 * l'audience qui tarife ; un refus tombe avant toute composition, clé rendue.
 */
describe("PlaceOrderHandler — les CGV cochées au panier", () => {
  function acceptingScene(salesTerms: FixedSalesTerms) {
    const sink = { placed: null as OrderToPlace | null };
    const released: string[] = [];
    const keys: OrderIdempotencyStore = {
      claim: () => Promise.resolve({ kind: "claimed" as const }),
      release: (_user, key) => {
        released.push(key);
        return Promise.resolve();
      },
      resolve: () => Promise.resolve(),
    };
    const handler = new PlaceOrderHandler(
      guard("orders", "active"),
      drafting(pickups(LABO_POINT), zones(), { status: "active", salesTerms }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      keys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(DEFAULT_ORDER_OPENING, "active", [], {}, salesTerms),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
    return { handler, sink, released };
  }
  const PRO_TERMS = { salesTermsPro: { revision: 4, fileId: null } } as const;

  it("accepte la version en vigueur de l'audience, et fige celle que le serveur résout", async () => {
    const { handler, sink } = acceptingScene(new FixedSalesTerms(PRO_TERMS));

    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({ salesTerms: { key: "salesTermsPro", revision: 4 } }),
        "c1",
      ),
    );

    expect(sink.placed?.salesTerms).toMatchObject({ document: "salesTermsPro", revision: 4 });
  });

  it("refuse une révision périmée avant toute composition, et rend la clé", async () => {
    const { handler, sink, released } = acceptingScene(new FixedSalesTerms(PRO_TERMS));

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({ salesTerms: { key: "salesTermsPro", revision: 3 } }),
          "c1",
        ),
      ),
    ).rejects.toBeInstanceOf(SalesTermsOutdatedError);
    expect(sink.placed).toBeNull();
    expect(released).toEqual(["3f2504e0-4f89-41d3-9a0c-0305e82c3301"]);
  });

  it("refuse les CGV particuliers cochées par une société active", async () => {
    const { handler } = acceptingScene(
      new FixedSalesTerms({ ...PRO_TERMS, salesTerms: { revision: 4, fileId: null } }),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({ salesTerms: { key: "salesTerms", revision: 4 } }),
          "c1",
        ),
      ),
    ).rejects.toBeInstanceOf(SalesTermsOutdatedError);
  });

  it("refuse une passation sans case quand un texte est en vigueur", async () => {
    const { handler } = acceptingScene(new FixedSalesTerms(PRO_TERMS));

    await expect(
      handler.execute(new PlaceOrderCommand("u1", payload({ salesTerms: null }), "c1")),
    ).rejects.toBeInstanceOf(SalesTermsOutdatedError);
  });

  it("CGV pro jamais rédigées : rien à cocher, la commande passe sans révision", async () => {
    const { handler, sink } = acceptingScene(new FixedSalesTerms());

    await handler.execute(new PlaceOrderCommand("u1", payload({ salesTerms: null }), "c1"));

    expect(sink.placed?.salesTerms).toEqual({
      document: "salesTermsPro",
      revision: null,
      fileId: null,
    });
  });
});

/**
 * La plus stricte gagne TOUJOURS (Hugo, 2026-10-21) : la limite propre d'un
 * article ne remplace plus la règle générale, elle ne peut que la resserrer.
 */
describe("PlaceOrderHandler — limite d'article et règle générale", () => {
  /** 2026-01-15 09:00Z = 10 h à Paris ; la livraison est demandée le lendemain. */
  const NEXT_DAY = "2026-01-16";
  /** La veille à 9 h (Paris) : déjà passée à PRICED_AT. */
  const GENERAL: OrderCutoffReader = {
    list: () =>
      Promise.resolve([
        {
          id: "def",
          pickupAddressId: null,
          pickupLabel: null,
          weekday: null,
          daysBefore: 1,
          time: "09:00",
          graceMinutes: 0,
        },
      ]),
  };
  /** Le jour même à 23 h : bien plus tard que la règle générale. */
  const lateLimits = new InMemoryProductCatalog([
    { ...CATALOG["VIE-001"]!, orderTimeLimit: { daysBefore: 0, time: "23:00", graceMinutes: 0 } },
  ]);

  function lateHandler(cutoffs: OrderCutoffReader, sink: { placed: OrderToPlace | null }) {
    return new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones(), { cutoffs, limits: lateLimits }),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(new FixedCancellationSettings()),
    );
  }

  it("une limite d'article plus tardive ne relâche pas l'heure limite générale", async () => {
    const sink = { placed: null as OrderToPlace | null };
    await expect(
      lateHandler(GENERAL, sink).execute(
        new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: NEXT_DAY }), null),
      ),
    ).rejects.toBeInstanceOf(PastOrderCutoffError);
    expect(sink.placed).toBeNull();
  });

  it("règle générale désactivée (aucune en vigueur) : la limite d'article seule décide", async () => {
    const sink = { placed: null as OrderToPlace | null };
    await lateHandler(noOrderCutoffs, sink).execute(
      new PlaceOrderCommand("u1", payload({ requestedDeliveryDate: NEXT_DAY }), null),
    );
    expect(sink.placed).not.toBeNull();
  });
});

/**
 * Le délai d'annulation figé à la passation (Hugo, 2026-10-26). Les dates ne
 * se comparent qu'entre elles : la passation calcule un instant, elle ne le
 * juge pas contre l'horloge.
 */
describe("PlaceOrderHandler — le délai d'annulation figé", () => {
  function handlerWith(
    sink: { placed: OrderToPlace | null },
    settings: FixedCancellationSettings,
    companyGuard: OrderGuardReader = guard(null, null),
  ): PlaceOrderHandler {
    return new PlaceOrderHandler(
      companyGuard,
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
      noWaivers,
      new FixedClock(PRICED_AT),
      freeKeys,
      noReader,
      directWork,
      new FixedVoucherQuotes(),
      new RecordingRedemption(),
      new RecordingDurable(),
      intakeAt(),
      new CustomerCancellationDeadline(settings),
    );
  }

  it("un particulier : N heures avant le début du créneau, au réglage du moment", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const settings = new FixedCancellationSettings({ delayEnabled: true, hoursBefore: 24 });

    await handlerWith(sink, settings).execute(new PlaceOrderCommand("u1", payload(), null));

    // Le 1er septembre 07:00 à Paris (UTC+2) = 05:00 UTC ; 24 h avant.
    expect(sink.placed?.customerCancellableUntil).toEqual(new Date("2026-08-31T05:00:00.000Z"));
  });

  it("un réglage sans délai ne fige rien : seul l'arrêt du plan limitera", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const settings = new FixedCancellationSettings({ delayEnabled: false });

    await handlerWith(sink, settings).execute(new PlaceOrderCommand("u1", payload(), null));

    expect(sink.placed?.customerCancellableUntil).toBeNull();
  });

  it("un pro reçoit nul : il annule jusqu'à l'arrêt du plan, sans délai réglable", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const settings = new FixedCancellationSettings({ delayEnabled: true, hoursBefore: 24 });

    await handlerWith(sink, settings, guard("orders", "active")).execute(
      new PlaceOrderCommand("u1", payload(), "c1"),
    );

    expect(sink.placed?.customerCancellableUntil).toBeNull();
  });
});
