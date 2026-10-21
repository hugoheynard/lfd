import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type CatalogPricing,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type PickupAddressView,
  type PlaceShopOrderPayload,
  type PublicOrderOpeningView,
} from "@lfd/contracts";

import { ownPayers } from "./payer-doubles.js";
import { intakeAt } from "./intake-doubles.js";
import { OrdersClosedForAudienceError } from "../../../domain/errors/orders-closed-for-audience.error.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InvalidEmailError } from "../../../../account/domain/errors/account-errors.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { type UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import {
  PaymentGateway,
  type CreateIntentParams,
} from "../../../../payments/domain/payment-gateway.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import { CompanyMercurialeReader } from "../../../../pricing/domain/ports/company-mercuriale.reader.js";
import { CustomerVolumeReader } from "../../../../pricing/domain/ports/customer-volume.reader.js";
import { PriceFloorReader } from "../../../../pricing/domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../../../pricing/domain/ports/price-rule.reader.js";
import { SkuVolumeReader } from "../../../../pricing/domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../../../../pricing/domain/ports/volume-commitment.reader.js";
import { VolumeLadderReader } from "../../../../pricing/domain/ports/volume-ladder.reader.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import {
  DeliveryClosedForAudienceError,
  IdempotencyKeyReusedError,
  OrderAlreadyInFlightError,
} from "../../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import {
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
  type DeliveryDefaults,
} from "../../../domain/ports/delivery-defaults.reader.js";
import {
  GuestBuyerRegistrar,
  type GuestBuyer,
} from "../../../domain/ports/guest-buyer.registrar.js";
import { OrderCutoffReader } from "../../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../../domain/ports/order-cutoff-waiver.gate.js";
import { OrderLateFeeReader } from "../../../domain/ports/order-late-fee.reader.js";
import { FixedDeliveryVat } from "./fixed-delivery-vat.js";
import { FixedSalesTerms } from "./fixed-sales-terms.js";
import { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { ProductionPlanClosedError } from "../../../domain/errors/production-plan-closed.error.js";
import { FixedClosedPlans, gateOf, openPlanGate, RecordingAdmissionDesk } from "./plan-doubles.js";
import {
  LoyaltyEarningPreview,
  type LoyaltyEarningBasis,
} from "../../../domain/ports/loyalty-earning-preview.js";
import { WelcomeBonusPreview } from "../../../domain/ports/welcome-bonus-preview.js";
import { OrderReader } from "../../../domain/ports/order.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import {
  ShopOrderIdempotencyStore,
  type IdempotencyClaim,
} from "../../../domain/ports/shop-order-idempotency.store.js";
import { CartAdjustments } from "../../services/cart-adjustments.service.js";
import { CustomerAudiences } from "../../services/customer-audiences.service.js";
import { OrderDrafting } from "../../services/order-drafting.service.js";
import { OrderOperations } from "../../services/order-operations.service.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { OrderLinePricing } from "../../services/order-line-pricing.service.js";
import { PlaceShopOrderCommand } from "../place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../place-shop-order.handler.js";
import { PAINS } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/index.js";
import { RecordingDurable } from "./durable-doubles.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";

/**
 * **La commande sans compte**, éprouvée là où elle décide — plan
 * `documentation/commandes/architecture-commande-sans-compte.md`, lot C.
 *
 * Ce que ces cas mesurent est ce qui DISTINGUE ce chemin de la passation
 * connectée : l'inscription du porteur, la carte sans alternative, la clientèle
 * figée, et surtout le rejeu qui ne rend aucun secret de paiement. La
 * composition du panier elle-même est celle de la caisse — elle a ses suites, et
 * les redoubler ici mesurerait deux fois la même chose.
 *
 * Le service de composition est le **vrai**, monté sur des doubles : c'est lui
 * qui ré-résout les prix et déduit la zone, et le doubler ferait éprouver le
 * handler contre une fiction.
 */

/** L'instant où les prix sont résolus — jamais le mur, jamais une fenêtre glissante. */
const PRICED_AT = new Date("2026-01-15T09:00:00.000Z");

const CATALOG: readonly UnsealedCatalogItem[] = [
  {
    family: PAINS,
    allergens: null,
    orderTimeLimit: null,
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 200_000,
    vatRate: 0,
  },
];

const catalog = new InMemoryProductCatalog(CATALOG);

/** Aucune question datée posée : la porte refuse plutôt que de servir un tarif d'aujourd'hui. */
const noPriceHistory = new (class extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
})();

const noMercuriales: CompanyMercurialeReader = {
  liveFor: () => Promise.resolve(null),
  liveAsOf: () => Promise.resolve(null),
  listFor: () => Promise.resolve([]),
  liveEverywhere: () => Promise.resolve([]),
};

const noPriceRules: PriceRuleReader = {
  listArchived: () => Promise.resolve([]),
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noPriceFloors: PriceFloorReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noSkuVolumes: SkuVolumeReader = { volumesFor: () => Promise.resolve(new Map()) };

const noVolumeLadders: VolumeLadderReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const noCommitments: VolumeCommitmentReader = {
  liveFor: () => Promise.resolve([]),
  liveAsOf: () => Promise.resolve([]),
};

const noCustomerVolumes: CustomerVolumeReader = {
  volumesFor: () => Promise.resolve(new Map<string, number>()),
  committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
};

const noDeliveryDefaults: DeliveryDefaultsReader = {
  of: (): Promise<DeliveryDefaults> => Promise.resolve(NO_DELIVERY_DEFAULTS),
};

const noOrderCutoffs: OrderCutoffReader = { list: () => Promise.resolve([]) };

const noLateFee: OrderLateFeeReader = { current: () => Promise.resolve(null) };

/**
 * **Aucune dérogation, et il ne peut pas y en avoir.** Une commande publique n'a
 * pas de société, donc rien à qui en accorder une : `OrderDrafting` ne consulte
 * même pas ce registre. Le double existe pour que la construction tienne.
 */
const noWaivers: OrderCutoffWaiverGate = {
  openFor: () => Promise.resolve(null),
  consume: () => Promise.reject(new Error("une commande publique ne consomme aucune dérogation")),
};

const deliveryAvailability = (
  view: DeliveryAvailabilityView = DEFAULT_DELIVERY_AVAILABILITY,
): DeliveryAvailabilityReader => ({ current: () => Promise.resolve(view) });

/** Sans société, la clientèle tarifée est B2C — et ce lecteur n'est jamais appelé. */
const noCompanies: CompanyStatusReader = {
  companyStatusOf: (): Promise<OrderCompanyStatus | null> => Promise.resolve(null),
};

const LABO_POINT: PickupAddressView = {
  id: "pickup_1",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { publicOpening: null, proPickup: null },
};

/** Aucune société n'a de point préféré : un retrait sans choix prend le seul point. */
const noPreferredPickup: PreferredPickupReader = {
  preferredPickupOf: () => Promise.resolve(null),
};

function pickups(resolved: PickupAddressView | null = LABO_POINT): PickupAddressRepository {
  return {
    list: () => Promise.resolve(resolved === null ? [] : [resolved]),
    resolve: () => Promise.resolve(resolved),
  };
}

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

/** La composition réelle, montée sur les doubles ci-dessus. */
function drafting(
  delivery: DeliveryAvailabilityView = DEFAULT_DELIVERY_AVAILABILITY,
  plans: OrderPlanGate = openPlanGate(),
  salesTerms: FixedSalesTerms = new FixedSalesTerms(),
): OrderDrafting {
  return new OrderDrafting(
    new OrderLinePricing(
      catalog,
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
    new CartAdjustments(pickups(), zones(), deliveryAvailability(delivery), noPreferredPickup),
    noDeliveryDefaults,
    noOrderCutoffs,
    new FixedClock(PRICED_AT),
    catalog,
    noWaivers,
    noLateFee,
    new CustomerAudiences(noCompanies),
    new OrderOperations(noSaleOperations(PRICED_AT)),
    ownPayers(),
    new FixedDeliveryVat(),
    plans,
    salesTerms,
  );
}

/** Le registre doublé : il note ce qu'on lui demande, et rend ce qu'on lui dit. */
class FakeKeys extends ShopOrderIdempotencyStore {
  readonly claimed: { key: string; fingerprint: string }[] = [];
  readonly released: string[] = [];
  readonly resolved: { key: string; orderId: string }[] = [];

  constructor(private readonly verdict: IdempotencyClaim = { kind: "claimed" }) {
    super();
  }

  claim(key: string, fingerprint: string): Promise<IdempotencyClaim> {
    this.claimed.push({ key, fingerprint });
    return Promise.resolve(this.verdict);
  }

  release(key: string): Promise<void> {
    this.released.push(key);
    return Promise.resolve();
  }

  resolve(key: string, orderId: string): Promise<void> {
    this.resolved.push({ key, orderId });
    return Promise.resolve();
  }
}

/** L'annuaire doublé : il capture l'invité inscrit et rend son identifiant. */
class FakeRegistrar extends GuestBuyerRegistrar {
  readonly registered: GuestBuyer[] = [];

  register(buyer: GuestBuyer): Promise<string> {
    this.registered.push(buyer);
    return Promise.resolve("user_guest");
  }
}

/** Ce que les doubles de paiement ont vu passer. */
interface PaymentCalls {
  intent: CreateIntentParams | null;
  retrieved: number;
}

function payments(sink: PaymentCalls): PaymentGateway {
  return {
    createIntent: (params) => {
      sink.intent = params;
      return Promise.resolve({ paymentIntentId: "pi_public", clientSecret: "pi_public_secret" });
    },
    retrieveIntent: () => {
      sink.retrieved += 1;
      return Promise.resolve({
        paymentIntentId: "pi_public",
        clientSecret: "pi_public_secret",
        state: "awaiting_payment",
      });
    },
    cancelIntent: () => Promise.resolve({ kind: "cancelled" }),
    publishableKey: () => "pk_test_123",
    parseWebhook: () => ({ kind: "ignored" }),
  };
}

function capturingRepo(sink: { placed: OrderToPlace | null }): OrderRepository {
  return {
    place: (order) => {
      sink.placed = order.toPersistence();
      return Promise.resolve({ id: "order_public_1", orderNumber: "ORD-PUBLIC" });
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

/**
 * Le lecteur de commandes, écrit en entier : un doublé partiel casté n'est pas
 * le port, et laisserait la suite jouer un contrat qui n'existe plus.
 *
 * Il ne rend **jamais** de commande : aucun de ces cas ne passe par le rejeu,
 * qui s'éprouve en e2e contre une vraie `OrderView`.
 */
const noReader: OrderReader = {
  listPersonal: () => Promise.resolve([]),
  findById: () => Promise.resolve(null),
  findAuthorByReference: () => Promise.resolve(null),
  findForPacking: () => Promise.reject(new Error("non utilisé")),
  listForProduction: () => Promise.resolve([]),
};

/** La fidélité doublée : elle note l'assiette reçue et rend le nombre qu'on lui dit. */
class FakeEarning extends LoyaltyEarningPreview {
  readonly asked: LoyaltyEarningBasis[] = [];

  constructor(private readonly points: number | null) {
    super();
  }

  pointsToEarn(basis: LoyaltyEarningBasis): Promise<number | null> {
    this.asked.push(basis);
    return Promise.resolve(this.points);
  }
}

/** Le bonus doublé : il rend le nombre qu'on lui dit. */
class FakeWelcome extends WelcomeBonusPreview {
  constructor(private readonly points: number | null) {
    super();
  }

  pointsOnJoining(): Promise<number | null> {
    return Promise.resolve(this.points);
  }
}

const KEY = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Le créneau que la commande a choisi — obligatoire depuis le 2026-10-14. */
const CHOSEN_WINDOW = { start: "07:00", end: "08:00" };

function payload(over: Partial<PlaceShopOrderPayload> = {}): PlaceShopOrderPayload {
  return {
    idempotencyKey: KEY,
    buyer: { firstName: "Camille", email: "camille@exemple.fr", phone: "0600000000" },
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: "pickup_1",
    requestedDeliveryDate: "2026-09-01",
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    // Le créneau est obligatoire à toute passation (Hugo, 2026-10-14). Les
    // points de ces suites n'ont pas d'heures déclarées : il n'y est pas jugé.
    requestedWindow: CHOSEN_WINDOW,
    ...over,
  };
}

/** Le handler et tout ce qu'il a touché, monté d'un coup. */
function scene(
  options: {
    readonly claim?: IdempotencyClaim;
    readonly delivery?: DeliveryAvailabilityView;
    readonly opening?: PublicOrderOpeningView;
    readonly points?: number | null;
    readonly welcomeBonus?: number | null;
    readonly plans?: OrderPlanGate;
    readonly salesTerms?: FixedSalesTerms;
  } = {},
) {
  const earning = new FakeEarning(options.points ?? null);
  const sink = { placed: null as OrderToPlace | null };
  const paid: PaymentCalls = { intent: null, retrieved: 0 };
  const keys = new FakeKeys(options.claim ?? { kind: "claimed" });
  const buyers = new FakeRegistrar();
  const published = new RecordingPublisher();
  const durable = new RecordingDurable();
  const handler = new PlaceShopOrderHandler(
    buyers,
    drafting(options.delivery, options.plans, options.salesTerms),
    capturingRepo(sink),
    payments(paid),
    published,
    new FixedClock(PRICED_AT),
    keys,
    noReader,
    new DirectUnitOfWork(),
    durable,
    intakeAt(options.opening),
    earning,
    new FakeWelcome(options.welcomeBonus ?? null),
  );
  return { handler, sink, paid, keys, buyers, published, durable, earning };
}

describe("PlaceShopOrderHandler — le porteur", () => {
  /** 2026-10-07 : la livraison l'apprenait par un appel en mémoire, perdu à un redémarrage. */
  it("écrit le fait durable « commande passée » pour la livraison", async () => {
    const { handler, durable } = scene();

    const placed = await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(durable.facts).toEqual([new CommerceOrderPlacedFact(placed.id).durableFact()]);
  });

  it("INSCRIT un invité et porte la commande à son nom", async () => {
    // C'est la voie retenue par le plan (§2) : la commande reste un `Order`
    // ordinaire, et c'est le PORTEUR qui change de nature. Sans lui,
    // `placedByUserId` aurait dû devenir nullable — 29 fichiers, un contrat de
    // canal publié et trois événements de domaine (§3.1).
    const { handler, sink, buyers } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(buyers.registered).toEqual([
      { firstName: "Camille", email: "camille@exemple.fr", phone: "0600000000" },
    ]);
    expect(sink.placed?.placedByUserId).toBe("user_guest");
    expect(sink.placed?.placedByStaffId).toBeNull();
  });

  it("NORMALISE l'adresse avant de l'écrire", async () => {
    // Deux graphies d'une même boîte ne doivent pas donner deux façons d'écrire
    // à la même personne — même si D2 admet qu'elles donnent deux lignes.
    const { handler, buyers } = scene();

    await handler.execute(
      new PlaceShopOrderCommand(
        payload({
          buyer: {
            firstName: " Camille ",
            email: "  Camille@Exemple.FR ",
            // Le numéro passe par la même mise en forme : les blancs multiples
            // se réduisent, et c'est ce qui est écrit qui est comparé.
            phone: " 06  00 00 00 00 ",
          },
        }),
      ),
    );

    expect(buyers.registered[0]).toEqual({
      firstName: "Camille",
      email: "camille@exemple.fr",
      phone: "06 00 00 00 00",
    });
  });

  it("REFUSE une identité que le domaine ne reconnaît pas, et REND la clé", async () => {
    // Le contrôleur valide une forme ; l'invariant est au domaine, et il tient
    // sur tous les chemins d'entrée. La clé rendue est ce qui permet au client
    // de corriger et de renvoyer.
    const { handler, keys, buyers } = scene();

    await expect(
      handler.execute(
        new PlaceShopOrderCommand(
          // Le téléphone est VALABLE : sans ça, le refus pourrait venir de lui
          // (obligatoire depuis D9) et ce cas ne prouverait plus ce qu'il dit.
          payload({ buyer: { firstName: "Camille", email: "camille", phone: "0600000000" } }),
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidEmailError);
    expect(buyers.registered).toEqual([]);
    expect(keys.released).toEqual([KEY]);
  });
});

describe("PlaceShopOrderHandler — la commande produite", () => {
  it("fige la langue de la boutique envoyée avec la commande (lot A3)", async () => {
    const { handler, sink } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload({ locale: "en" })));

    expect(sink.placed?.locale).toBe("en");
  });

  it("laisse la langue à null quand la boutique ne l'a pas envoyée — jamais « fr » par défaut", async () => {
    const { handler, sink } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(sink.placed?.locale).toBeNull();
  });

  it("est PUBLIQUE et sans société", async () => {
    // D5 : `OrderClientele` vaut `pro | public`, et l'agrégat la déduit de
    // l'absence de société. Elle est figée à la passation — jamais relue depuis
    // une société qui peut changer ou disparaître.
    const { handler, sink } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(sink.placed?.clientele).toBe("public");
    expect(sink.placed?.companyId).toBeNull();
  });

  it("publie le fait de domaine avec le porteur inscrit — c'est lui qui déclenche le courriel", async () => {
    // Le gain décisif de cette voie (§5) : le porteur a une adresse, donc la
    // confirmation et le QR de retrait partent vraiment. Sans `User`, les deux
    // envois sortaient en silence, sans destinataire.
    const { handler, published, sink } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    // Le montant est celui que l'agrégat a calculé — relu de ce qui a été écrit
    // plutôt que « n'importe quel nombre » : un événement qui annoncerait un
    // total différent de la commande fausserait le journal de croissance sans
    // qu'aucune assertion ne le voie.
    const total = sink.placed?.totalCents ?? 0;
    expect(total).toBeGreaterThan(0);
    expect(published.published).toEqual([
      new OrderPlacedEvent("order_public_1", "ORD-PUBLIC", "user_guest", null, total),
    ]);
  });

  it("résout la clé dans la même unité de travail que l'écriture", async () => {
    const { handler, keys } = scene();

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(keys.resolved).toEqual([{ key: KEY, orderId: "order_public_1" }]);
  });
});

describe("PlaceShopOrderHandler — le règlement", () => {
  it("demande une carte, TOUJOURS, et sans société", async () => {
    // Le compte se négocie avec une société cliente ; un panier n'en est pas
    // une. Le contrat public ne porte donc aucun `settlement` à lire.
    const { handler, paid, sink } = scene();

    const placed = await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(paid.intent).toEqual({
      amountCents: sink.placed?.totalCents,
      currency: "eur",
      companyId: null,
    });
    expect(placed.payment).toEqual({
      clientSecret: "pi_public_secret",
      publishableKey: "pk_test_123",
      amountCents: sink.placed?.totalCents,
    });
    expect(sink.placed?.paymentStatus).toBe("pending");
  });
});

describe("PlaceShopOrderHandler — les points qu'un compte aurait rapportés", () => {
  it("rend les points calculés sur l'assiette que la commande a écrite", async () => {
    const { handler, sink, earning } = scene({ points: 12 });

    const placed = await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(placed.loyaltyPointsWithAccount).toBe(12);
    expect(earning.asked).toEqual([
      {
        buyerUserId: "user_guest",
        subtotalCents: sink.placed?.subtotalCents,
        discountCents: sink.placed?.discountCents,
        voucherDiscountCents: 0,
      },
    ]);
  });

  it("rend null quand la commande n'en aurait rapporté aucun", async () => {
    const { handler } = scene({ points: null });

    const placed = await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(placed.loyaltyPointsWithAccount).toBeNull();
  });
});

describe("PlaceShopOrderHandler — le bonus de bienvenue (plan bienvenue, lot D)", () => {
  it("rend le bonus que la création du compte offrirait", async () => {
    const { handler } = scene({ welcomeBonus: 500 });

    const placed = await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(placed.welcomeBonusPoints).toBe(500);
  });

  it("rend null quand le bonus est éteint", async () => {
    const { handler } = scene({ welcomeBonus: null });

    const placed = await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(placed.welcomeBonusPoints).toBeNull();
  });
});

describe("PlaceShopOrderHandler — le rejeu", () => {
  /**
   * ⚠️ **Le rejeu lui-même s'éprouve en e2e** (`test/shop-order.e2e-spec.ts`),
   * pas ici, et ce n'est pas un renoncement : il rend une commande RELUE, donc
   * une `OrderView` entière. La fabriquer à la main demanderait de l'inventer
   * champ par champ — c'est-à-dire d'affirmer une forme que la base est seule à
   * produire, et de la voir diverger au premier champ ajouté.
   *
   * Ce qui se prouve là-bas : deux appels sous la même clé ne font qu'une
   * commande, et le second ne porte **aucun** secret de paiement.
   */
  it("REFUSE la même clé sur un panier différent", async () => {
    // Sans ce refus, une correction renverrait l'ancienne commande et le front
    // viderait le panier corrigé en silence.
    const { handler } = scene({ claim: { kind: "mismatch" } });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
  });

  it("REFUSE un appel encore en vol", async () => {
    const { handler } = scene({ claim: { kind: "in_flight" } });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toBeInstanceOf(
      OrderAlreadyInFlightError,
    );
  });
});

describe("PlaceShopOrderHandler — ce qui échoue avant l'écriture", () => {
  it("REND la clé quand la composition refuse", async () => {
    // Le critère est la POSITION, jamais la nature de l'erreur : un SKU inconnu
    // tombe avant la persistance, donc le client doit pouvoir corriger et
    // renvoyer sous la même clé.
    const { handler, keys, sink } = scene();

    await expect(
      handler.execute(
        new PlaceShopOrderCommand(payload({ lines: [{ sku: "INCONNU", quantity: 1 }] })),
      ),
    ).rejects.toBeInstanceOf(UnknownSkuError);
    expect(keys.released).toEqual([KEY]);
    expect(sink.placed).toBeNull();
  });

  /** Lot O3 : l'invité aussi est refusé sur un plan arrêté (O5), et sa clé lui est rendue. */
  it("REFUSE une journée au plan arrêté, REND la clé, sans intention", async () => {
    const day = payload().requestedDeliveryDate;
    const { handler, keys, sink, paid } = scene({
      plans: gateOf(new FixedClosedPlans([day]), new RecordingAdmissionDesk([day])),
    });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toBeInstanceOf(
      ProductionPlanClosedError,
    );
    expect(keys.released).toEqual([KEY]);
    expect(paid.intent).toBeNull();
    expect(sink.placed).toBeNull();
  });

  it("réclame la clé AVANT de toucher au prestataire de paiement", async () => {
    // L'intention Stripe est créée avant la persistance : un garde posé plus bas
    // laisserait déjà passer une seconde intention pour un double clic.
    const { handler, paid } = scene({ claim: { kind: "in_flight" } });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toThrow();
    expect(paid.intent).toBeNull();
  });
});

/**
 * 🔴 **LA LIVRAISON SANS COMPTE EST UNE DÉCISION D'ADMIN** (Hugo, 2026-09-21).
 *
 * Le front cache la porte du coursier quand la clé est fermée — mais masquer
 * n'est pas fermer, et le dépôt écrit la différence dans son catalogue de clés :
 * `hidden` ne ferme rien, `closed` si. Sans ce refus, une requête recopiée
 * depuis l'onglet réseau ferait livrer quand même, et l'admin qui a « fermé »
 * la livraison croirait l'avoir fermée.
 */
/**
 * La clé `publicDelivery` a été retirée le 2026-10-09 : la livraison sans
 * compte ne dépend plus que du réglage « Livraison » (`openToB2c`), opposé par
 * `CartAdjustments` pendant la composition — la même lecture que le devis.
 */
describe("PlaceShopOrderHandler — la livraison fermée aux particuliers", () => {
  const LIVRAISON = payload({
    fulfillmentMethod: "delivery",
    pickupAddressId: null,
    deliveryAddress: {
      label: "Chalet",
      ligne1: "12 chemin des Barmettes",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
  });
  const CLOSED_TO_B2C = { ...DEFAULT_DELIVERY_AVAILABILITY, openToB2c: false };

  it("🔴 refuse une livraison quand le réglage la ferme aux particuliers, et rend la clé", async () => {
    const { handler, sink, keys } = scene({ delivery: CLOSED_TO_B2C });

    await expect(handler.execute(new PlaceShopOrderCommand(LIVRAISON))).rejects.toBeInstanceOf(
      DeliveryClosedForAudienceError,
    );
    expect(sink.placed).toBeNull();
    // Refusé pendant la composition, donc APRÈS la réclamation : la clé est
    // rendue pour que le client puisse choisir le retrait et renvoyer.
    expect(keys.released).toEqual([LIVRAISON.idempotencyKey]);
  });

  it("laisse passer un retrait, livraison fermée aux particuliers", async () => {
    const { handler, sink } = scene({ delivery: CLOSED_TO_B2C });

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(sink.placed).not.toBeNull();
  });
});

/** L'ouverture de la boutique (Hugo, 2026-10-09) : sans compte = particulier. */
describe("PlaceShopOrderHandler — la boutique fermée aux particuliers", () => {
  it("refuse avant d'inscrire le porteur, et rend la clé", async () => {
    const { handler, sink, buyers, keys } = scene({
      opening: { ordersOpenToB2b: true, ordersOpenToB2c: false },
    });

    await expect(handler.execute(new PlaceShopOrderCommand(payload()))).rejects.toBeInstanceOf(
      OrdersClosedForAudienceError,
    );
    expect(buyers.registered).toEqual([]);
    expect(sink.placed).toBeNull();
    expect(keys.released).toEqual([KEY]);
  });

  it("passe quand seule la boutique pro est fermée", async () => {
    const { handler, sink } = scene({ opening: { ordersOpenToB2b: false, ordersOpenToB2c: true } });

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(sink.placed).not.toBeNull();
  });
});

/**
 * Les CGV figées à la passation de la boutique (plan
 * `legal/plan-cgv-par-audience.md`, C4′) : une commande publique est sans
 * société, donc tarifée et liée comme un particulier.
 */
describe("PlaceShopOrderHandler — les CGV en vigueur", () => {
  it("porte les CGV particuliers, révision et PDF en vigueur", async () => {
    const salesTerms = new FixedSalesTerms({ salesTerms: { revision: 3, fileId: "ldf_part_2" } });
    const { handler, sink } = scene({ salesTerms });

    await handler.execute(new PlaceShopOrderCommand(payload()));

    expect(salesTerms.asked).toEqual(["salesTerms"]);
    expect(sink.placed?.salesTerms).toEqual({
      document: "salesTerms",
      revision: 3,
      fileId: "ldf_part_2",
    });
  });

  /** L'idempotence : un rejeu ne recompose rien, donc ne relit ni ne refige les CGV. */
  it("un rejeu ne relit pas les CGV et n'écrit rien", async () => {
    const salesTerms = new FixedSalesTerms({ salesTerms: { revision: 3, fileId: null } });
    const { handler, sink } = scene({
      claim: { kind: "replayed", orderId: "order_1" },
      salesTerms,
    });

    await handler.execute(new PlaceShopOrderCommand(payload())).catch(() => undefined);

    expect(salesTerms.asked).toEqual([]);
    expect(sink.placed).toBeNull();
  });
});
