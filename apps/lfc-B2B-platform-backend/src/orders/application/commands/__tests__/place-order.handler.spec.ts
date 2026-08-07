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
  OrderCompanyNotFoundError,
  PickupNotConfiguredError,
  UnknownDeliveryZoneError,
  UnknownSkuError,
} from "../../../domain/errors/order-errors.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
  type OrderPaymentTerm,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import {
  type CatalogItem,
  ProductCatalogReader,
} from "../../../domain/ports/product-catalog.reader.js";
import { PlaceOrderCommand } from "../place-order.command.js";
import { PlaceOrderHandler } from "../place-order.handler.js";

const CATALOG: Record<string, CatalogItem> = {
  "VIE-001": { sku: "VIE-001", name: "Croissant", unitPriceCents: 200, vatRate: 0 },
  "VIE-002": { sku: "VIE-002", name: "Pain au chocolat", unitPriceCents: 220, vatRate: 0 },
};

/**
 * Garde doublée. Le terme par défaut est **différé** (`net60`) : la plupart des
 * tests de prix visent une entreprise active, ce qui évite une intention Stripe.
 * Les tests de paiement forcent `per_order` ou un statut non actif.
 */
function guard(
  role: OrderRole | null,
  status: OrderCompanyStatus | null,
  term: OrderPaymentTerm | null = "net60",
): OrderGuardReader {
  return {
    roleOf: () => Promise.resolve(role),
    companyStatusOf: () => Promise.resolve(status),
    paymentTermOf: () => Promise.resolve(term),
  };
}

/** Passerelle de paiement doublée : capture l'appel `createIntent` (sans réseau). */
function payments(sink: { intent: CreateIntentParams | null } = { intent: null }): PaymentGateway {
  return {
    createIntent: (params) => {
      sink.intent = params;
      return Promise.resolve({ paymentIntentId: "pi_test_1", clientSecret: "pi_test_1_secret" });
    },
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

/** Zones doublées : seule la zone **trouvée par id** (checkout coursier) varie. */
function zones(found: DeliveryZoneView | null = null): DeliveryZoneRepository {
  return {
    list: () => Promise.resolve(found === null ? [] : [found]),
    findById: () => Promise.resolve(found),
    resolveForPostalCode: () => Promise.resolve(found),
    create: () => Promise.resolve("zone_1"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
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

/** Adresse de livraison libre (coursier). */
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
    deliveryZoneId: null,
    deliveryAddress: null,
    pickupAddressId: null,
    requestedDeliveryDate: null,
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    ...over,
  };
}

describe("PlaceOrderHandler", () => {
  it("refuse un non-membre par un 404 non-divulguant quand une entreprise est visée", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard(null, "active"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(),
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
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(intentSink),
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
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(),
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
      },
    ]);
    expect(sink.placed?.subtotalCents).toBe(600);
    expect(sink.placed?.totalCents).toBe(600);
  });

  it("fusionne les lignes en double par SKU", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(),
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
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(),
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
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(),
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
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(null),
      zones(),
      payments(),
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
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(point),
      zones(),
      payments(),
    );

    // 2 × 200 = 400 ; remise 20 % = 80 ; total = 320.
    await handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" })));

    expect(sink.placed?.subtotalCents).toBe(400);
    expect(sink.placed?.discountCents).toBe(80);
    expect(sink.placed?.deliveryFeeCents).toBe(0);
    expect(sink.placed?.totalCents).toBe(320);
  });

  it("en COURSIER, fige l'adresse libre et ajoute le frais de la zone choisie", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const zone: DeliveryZoneView = {
      id: "z1",
      postalPrefixes: ["73150"],
      label: "Val d'Isère",
      fee: { mode: "amount", cents: 2000 },
    };
    const handler = new PlaceOrderHandler(
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(zone),
      payments(),
    );

    // 2 × 200 = 400 HT (TVA 0 dans ce catalogue de test) ; frais 20 € = 2000 HT
    // + TVA livraison 20 % = 400 ; total TTC = 400 + 2000 + 400 = 2800.
    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        payload({
          companyId: "c1",
          fulfillmentMethod: "delivery",
          deliveryZoneId: "z1",
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

  it("refuse le COURSIER vers une zone inconnue (400), sans rien écrire", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(null),
      payments(),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          payload({
            companyId: "c1",
            fulfillmentMethod: "delivery",
            deliveryZoneId: "ghost",
            deliveryAddress: COURIER_ADDR,
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(UnknownDeliveryZoneError);
    expect(sink.placed).toBeNull();
  });

  it("en PER_ORDER, crée une intention Stripe du total, marque pending et renvoie le clientSecret", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active", "per_order"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(intentSink),
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

  it("en terme différé (net60) sur entreprise active, ne crée AUCUNE intention et marque not_required", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(intentSink),
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
      guard("member", "pending", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      payments(intentSink),
    );

    await handler.execute(new PlaceOrderCommand("u1", payload({ companyId: "c1" })));

    expect(intentSink.intent?.amountCents).toBe(400);
    expect(sink.placed?.paymentStatus).toBe("pending");
  });
});
