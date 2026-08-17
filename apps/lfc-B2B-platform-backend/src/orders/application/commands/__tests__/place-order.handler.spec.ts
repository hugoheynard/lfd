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
import {
  NoDeliveryZoneForPostalCodeError,
  OrderCompanyNotFoundError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../../domain/errors/order-errors.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import {
  type CatalogItem,
  ProductCatalogReader,
} from "../../../domain/ports/product-catalog.reader.js";
import { DomainEventPublisher } from "../../../../infra/events/domain-event-publisher.js";
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
import { OrderDrafting } from "../../services/order-drafting.service.js";

/**
 * Aucun réglage d'adresse : tout ce que la commande porte y est donc un choix.
 * Les cas de préremplissage sont couverts par `agreed-fulfillment.spec` — ici on
 * exerce le handler, pas la règle de provenance.
 */
function noDeliveryDefaults(): DeliveryDefaultsReader {
  return { of: (): Promise<DeliveryDefaults> => Promise.resolve(NO_DELIVERY_DEFAULTS) };
}
import { PlaceOrderCommand } from "../place-order.command.js";
import { PlaceOrderHandler } from "../place-order.handler.js";

/**
 * Catalogue **sans règle tarifaire** : le comportement du système avant qu'une
 * seule règle n'existe. Ces suites éprouvent la commande, pas le prix — la
 * résolution a ses propres tests, purs et exhaustifs.
 */
const noPriceRules: PriceRuleReader = {
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

/** Aucune limite posée : le prix sort du pipeline tel quel. */
const noPriceFloors: PriceFloorReader = {
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
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};

const CATALOG: Record<string, CatalogItem> = {
  "VIE-001": { sku: "VIE-001", name: "Croissant", unitPriceCents: 200, vatRate: 0 },
  "VIE-002": { sku: "VIE-002", name: "Pain au chocolat", unitPriceCents: 220, vatRate: 0 },
};

/**
 * Garde doublée. Le règlement **au compte** est le défaut : la plupart des
 * tests de prix visent une entreprise active, ce qui évite une intention Stripe.
 * Les tests de paiement forcent l'absence de crédit, ou un statut non actif.
 */
function guard(
  role: OrderRole | null,
  status: OrderCompanyStatus | null,
  onAccount = true,
): OrderGuardReader {
  return {
    roleOf: () => Promise.resolve(role),
    companyStatusOf: () => Promise.resolve(status),
    settlesOnAccount: () => Promise.resolve(onAccount),
  };
}

/** Publisher d'événements doublé : capture ce qui est publié (par extension du port, sans cast). */
class FakeEvents extends DomainEventPublisher {
  readonly published: object[] = [];
  publish(event: object): void {
    this.published.push(event);
  }
}

/** Fabrique un publisher doublé frais. */
function events(): FakeEvents {
  return new FakeEvents();
}

/** Passerelle de paiement doublée : capture l'appel `createIntent` (sans réseau). */
function payments(sink: { intent: CreateIntentParams | null } = { intent: null }): PaymentGateway {
  return {
    createIntent: (params) => {
      sink.intent = params;
      return Promise.resolve({ paymentIntentId: "pi_test_1", clientSecret: "pi_test_1_secret" });
    },
    retrieveIntent: () => Promise.resolve({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret" }),
    retrieveIntent: () => Promise.resolve({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret" }),
    publishableKey: () => "pk_test_123",
    parseWebhook: () => ({ kind: "ignored" }),
  };
}

const catalog: ProductCatalogReader = {
  resolve: (sku) => CATALOG[sku] ?? null,
};

/** Points de retrait doublés : seul le point **résolu** varie. */
function pickups(resolved: PickupAddressView | null = null): PickupAddressRepository {
  return {
    list: () => Promise.resolve([]),
    resolve: () => Promise.resolve(resolved),
    create: () => Promise.resolve("pickup_1"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    setDefault: () => Promise.resolve(),
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
function drafting(
  pickupsDouble: PickupAddressRepository,
  zonesDouble: DeliveryZoneRepository,
): OrderDrafting {
  return new OrderDrafting(
    catalog,
    noPriceRules,
    noPriceFloors,
    noSkuVolumes,
    noVolumeLadders,
    pickupsDouble,
    zonesDouble,
    noDeliveryDefaults(),
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
  isDefault: true,
  discount: null,
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
    markPaid: () => Promise.resolve(),
    markPaymentFailed: () => Promise.resolve(),
  };
}

/** Payload par défaut : **retrait**, **sans entreprise** (le chemin zéro friction). */
function payload(over: Partial<PlaceOrderPayload> = {}): PlaceOrderPayload {
  return {
    companyId: null,
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    pickupAddressId: null,
    requestedDeliveryDate: null,
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    ...over,
  };
}

describe("PlaceOrderHandler", () => {
  it("publie OrderPlacedEvent après persistance (signal lead chaud)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const published = events();
    const handler = new PlaceOrderHandler(
      guard(null, null),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      published,
    );

    await handler.execute(new PlaceOrderCommand("u1", payload()));

    expect(published.published).toHaveLength(1);
    const [event] = published.published;
    expect(event).toBeInstanceOf(OrderPlacedEvent);
    const placed = event as OrderPlacedEvent;
    expect(placed.orderId).toBe("order_1");
    expect(placed.placedByUserId).toBe("u1");
    expect(placed.companyId).toBeNull();
    expect(placed.totalCents).toBe(400);
  });

  it("refuse un non-membre par un 404 non-divulguant quand une entreprise est visée", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard(null, "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
    );

    await expect(
      handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" }))),
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
    );

    const result = await handler.execute(new PlaceOrderCommand("u1", payload()));

    // 2 × 200 = 400, aucun terme d'entreprise → carte, intent sans companyId.
    expect(intentSink.intent).toEqual({ amountCents: 400, currency: "eur", companyId: null });
    expect(sink.placed?.companyId).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(result.payment?.amountCents).toBe(400);
  });

  it("résout les prix au SERVEUR — le prix du client est ignoré", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
    );

    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({ companyId: "c1", lines: [{ sku: "VIE-001", quantity: 3 }] }),
      ),
    );

    expect(sink.placed?.lines).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceCents: 200,
        vatRate: 0,
        quantity: 3,
        lineTotalCents: 600,
        // Aucune règle dans ces doubles : la trace existe et dit qu'aucun étage
        // n'a joué. C'est une affirmation, pas une absence.
        pricing: {
          basePriceCents: 200,
          steps: [],
          floored: false,
          // Aucun plancher posé : il n'y a pas d'étage à commenter.
          floorDecision: null,
        },
      },
    ]);
    expect(sink.placed?.subtotalCents).toBe(600);
    expect(sink.placed?.totalCents).toBe(600);
  });

  it("fusionne les lignes en double par SKU", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
    );

    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({
          companyId: "c1",
          lines: [
            { sku: "VIE-001", quantity: 2 },
            { sku: "VIE-002", quantity: 1 },
            { sku: "VIE-001", quantity: 3 },
          ],
        }),
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
      guard("member", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({ companyId: "c1", lines: [{ sku: "NOPE-999", quantity: 1 }] }),
        ),
      ),
    ).rejects.toBeInstanceOf(UnknownSkuError);
    expect(sink.placed).toBeNull();
  });

  it("en RETRAIT, fige l'adresse du point et n'attache ni zone ni adresse de livraison", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(),
      events(),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" })));

    expect(sink.placed?.fulfillmentMethod).toBe("pickup");
    expect(sink.placed?.deliveryZoneId).toBeNull();
    expect(sink.placed?.deliveryAddress).toBeNull();
    expect(sink.placed?.pickupAddress).toEqual(LABO_SNAPSHOT);
  });

  it("refuse le RETRAIT quand aucun point de retrait n'est configuré (409)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      drafting(pickups(null), zones()),
      capturingRepo(sink),
      payments(),
      events(),
    );

    await expect(
      handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" }))),
    ).rejects.toBeInstanceOf(PickupNotConfiguredError);
    expect(sink.placed).toBeNull();
  });

  it("en RETRAIT, applique la remise du point au total", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const point: PickupAddressView = { ...LABO_POINT, discount: { mode: "percent", bp: 2000 } };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      drafting(pickups(point), zones()),
      capturingRepo(sink),
      payments(),
      events(),
    );

    // 2 × 200 = 400 ; remise 20 % = 80 ; total = 320.
    await handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" })));

    expect(sink.placed?.subtotalCents).toBe(400);
    expect(sink.placed?.discountCents).toBe(80);
    expect(sink.placed?.deliveryFeeCents).toBe(0);
    expect(sink.placed?.totalCents).toBe(320);
  });

  it("en COURSIER, fige l'adresse livrée et déduit le frais de SON code postal", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      drafting(pickups(), zones(TARENTAISE)),
      capturingRepo(sink),
      payments(),
      events(),
    );

    // 2 × 200 = 400 HT (TVA 0 dans ce catalogue de test) ; frais 20 € = 2000 HT
    // + TVA livraison 20 % = 400 ; total TTC = 400 + 2000 + 400 = 2800.
    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({
          companyId: "c1",
          fulfillmentMethod: "delivery",
          deliveryAddress: COURIER_ADDR,
        }),
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

  it("refuse le COURSIER vers un code postal qu'AUCUNE zone ne dessert, sans rien écrire", async () => {
    // Un secteur non couvert n'est pas un secteur gratuit : c'est un secteur où
    // la tournée n'a pas de coût connu. On refuse plutôt que de livrer à 0 €.
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      drafting(pickups(), zones(TARENTAISE)),
      capturingRepo(sink),
      payments(),
      events(),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({
            companyId: "c1",
            fulfillmentMethod: "delivery",
            deliveryAddress: { ...COURIER_ADDR, codePostal: "75002", ville: "Paris" },
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(NoDeliveryZoneForPostalCodeError);
    expect(sink.placed).toBeNull();
  });

  it("en PER_ORDER, crée une intention Stripe du total, marque pending et renvoie le clientSecret", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active", false),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
    );

    const result = await handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" })));

    expect(intentSink.intent).toEqual({ amountCents: 400, currency: "eur", companyId: "c1" });
    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(sink.placed?.stripePaymentIntentId).toBe("pi_test_1");
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
      guard("member", "active"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
    );

    const result = await handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" })));

    expect(intentSink.intent).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(sink.placed?.stripePaymentIntentId).toBeNull();
    expect(result.payment).toBeUndefined();
  });

  it("entreprise NON active (pending) : carte requise malgré un terme différé", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("member", "pending"),
      drafting(pickups(LABO_POINT), zones()),
      capturingRepo(sink),
      payments(intentSink),
      events(),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" })));

    expect(intentSink.intent?.amountCents).toBe(400);
    expect(sink.placed?.paymentStatus).toBe("pending");
  });
});
