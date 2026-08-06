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
import { DeliveryAddressReader } from "../../../domain/ports/delivery-address.reader.js";
import {
  CompanyNotActivatedError,
  OrderCompanyNotFoundError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../../domain/errors/order-errors.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
  type OrderPaymentTerm,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import { OrderRepository, type OrderToPlace } from "../../../domain/ports/order.repository.js";
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
 * Terme par défaut **différé** (`net60`) : la plupart des tests portent sur le
 * prix, pas le paiement — un terme différé évite de créer une intention Stripe.
 * Les tests du paiement passent explicitement `per_order`.
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

/** Points de retrait doublés : seul le point **résolu** varie (le reste inutilisé ici). */
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

/** Zones de livraison doublées : seule la zone **trouvée par code postal** varie. */
function zones(found: DeliveryZoneView | null = null): DeliveryZoneRepository {
  return {
    list: () => Promise.resolve(found === null ? [] : [found]),
    resolveForPostalCode: () => Promise.resolve(found),
    create: () => Promise.resolve("zone_1"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
}

/** Lecteur d'adresse de livraison doublé : le code postal résolu varie. */
function deliveryAddrs(postalCode: string | null = null): DeliveryAddressReader {
  return { postalCodeOf: () => Promise.resolve(postalCode) };
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

/** Repo qui capture ce qu'on lui demande d'écrire, sans base. */
function capturingRepo(sink: { placed: OrderToPlace | null }): OrderRepository {
  return {
    place: (order) => {
      sink.placed = order;
      return Promise.resolve({ id: "order_1", orderNumber: "ORD-TEST" });
    },
    markPaid: () => Promise.resolve(),
    markPaymentFailed: () => Promise.resolve(),
  };
}

function payload(over: Partial<PlaceOrderPayload> = {}): PlaceOrderPayload {
  return {
    fulfillmentMethod: "delivery",
    deliveryAddressId: "addr_1",
    pickupAddressId: null,
    requestedDeliveryDate: null,
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    ...over,
  };
}

describe("PlaceOrderHandler", () => {
  it("refuse un non-membre par un 404 non-divulguant, sans rien écrire", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard(null, "active"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    await expect(
      handler.execute(new PlaceOrderCommand("u1", "c1", payload())),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
    expect(sink.placed).toBeNull();
  });

  it("refuse une entreprise non activée (409), même à un membre", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "pending"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    await expect(
      handler.execute(new PlaceOrderCommand("u1", "c1", payload())),
    ).rejects.toBeInstanceOf(CompanyNotActivatedError);
    expect(sink.placed).toBeNull();
  });

  it("résout les prix au SERVEUR — le prix du client est ignoré", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    // Le payload ne porte que sku+quantité ; même si un client forgeait un prix,
    // il n'a aucun champ où le mettre. On vérifie que le serveur applique 200 c.
    await handler.execute(
      new PlaceOrderCommand("u1", "c1", payload({ lines: [{ sku: "VIE-001", quantity: 3 }] })),
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
      guard("member", "active"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        "c1",
        payload({
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
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand("u1", "c1", payload({ lines: [{ sku: "NOPE-999", quantity: 1 }] })),
      ),
    ).rejects.toBeInstanceOf(UnknownSkuError);
    expect(sink.placed).toBeNull();
  });

  it("en RETRAIT, fige l'adresse du point de retrait et n'attache pas d'adresse de livraison", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      catalog,
      capturingRepo(sink),
      pickups(LABO_POINT),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        "c1",
        payload({ fulfillmentMethod: "pickup", deliveryAddressId: null }),
      ),
    );

    expect(sink.placed?.fulfillmentMethod).toBe("pickup");
    expect(sink.placed?.deliveryAddressId).toBeNull();
    expect(sink.placed?.pickupAddress).toEqual(LABO_SNAPSHOT);
  });

  it("refuse le RETRAIT quand aucun point de retrait n'est configuré (409)", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      catalog,
      capturingRepo(sink),
      pickups(null),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    await expect(
      handler.execute(
        new PlaceOrderCommand(
          "u1",
          "c1",
          payload({ fulfillmentMethod: "pickup", deliveryAddressId: null }),
        ),
      ),
    ).rejects.toBeInstanceOf(PickupNotConfiguredError);
    expect(sink.placed).toBeNull();
  });

  it("en RETRAIT, applique la remise du point au total", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const point: PickupAddressView = { ...LABO_POINT, discount: { mode: "percent", bp: 2000 } };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      catalog,
      capturingRepo(sink),
      pickups(point),
      zones(),
      deliveryAddrs(),
      payments(),
    );

    // 2 × 200 = 400 ; remise 20 % = 80 ; total = 320.
    await handler.execute(
      new PlaceOrderCommand(
        "u1",
        "c1",
        payload({
          fulfillmentMethod: "pickup",
          deliveryAddressId: null,
          lines: [{ sku: "VIE-001", quantity: 2 }],
        }),
      ),
    );

    expect(sink.placed?.subtotalCents).toBe(400);
    expect(sink.placed?.discountCents).toBe(80);
    expect(sink.placed?.deliveryFeeCents).toBe(0);
    expect(sink.placed?.totalCents).toBe(320);
  });

  it("en LIVRAISON vers une zone, ajoute le frais fixe au total", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const zone: DeliveryZoneView = {
      id: "z1",
      postalPrefixes: ["73150"],
      label: "Val d'Isère",
      fee: { mode: "amount", cents: 2000 },
    };
    const handler = new PlaceOrderHandler(
      guard("member", "active"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(zone),
      deliveryAddrs("73150"),
      payments(),
    );

    // 2 × 200 = 400 ; frais 20 € = 2000 ; total = 2400.
    await handler.execute(
      new PlaceOrderCommand("u1", "c1", payload({ lines: [{ sku: "VIE-001", quantity: 2 }] })),
    );

    expect(sink.placed?.subtotalCents).toBe(400);
    expect(sink.placed?.discountCents).toBe(0);
    expect(sink.placed?.deliveryFeeCents).toBe(2000);
    expect(sink.placed?.totalCents).toBe(2400);
  });

  it("en PER_ORDER, crée une intention Stripe du montant total, marque pending et renvoie le clientSecret", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active", "per_order"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(),
      deliveryAddrs(),
      payments(intentSink),
    );

    // 2 × 200 = 400, aucun ajustement → l'intention doit porter 400 centimes.
    const result = await handler.execute(
      new PlaceOrderCommand("u1", "c1", payload({ lines: [{ sku: "VIE-001", quantity: 2 }] })),
    );

    expect(intentSink.intent).toEqual({ amountCents: 400, currency: "eur", companyId: "c1" });
    expect(sink.placed?.paymentStatus).toBe("pending");
    expect(sink.placed?.stripePaymentIntentId).toBe("pi_test_1");
    expect(result.payment).toEqual({
      clientSecret: "pi_test_1_secret",
      publishableKey: "pk_test_123",
      amountCents: 400,
    });
  });

  it("en terme différé (net60), ne crée AUCUNE intention et marque not_required", async () => {
    const sink = { placed: null as OrderToPlace | null };
    const intentSink = { intent: null as CreateIntentParams | null };
    const handler = new PlaceOrderHandler(
      guard("member", "active", "net60"),
      catalog,
      capturingRepo(sink),
      pickups(),
      zones(),
      deliveryAddrs(),
      payments(intentSink),
    );

    const result = await handler.execute(
      new PlaceOrderCommand("u1", "c1", payload({ lines: [{ sku: "VIE-001", quantity: 2 }] })),
    );

    expect(intentSink.intent).toBeNull();
    expect(sink.placed?.paymentStatus).toBe("not_required");
    expect(sink.placed?.stripePaymentIntentId).toBeNull();
    expect(result.payment).toBeUndefined();
  });
});
