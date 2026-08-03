import type { BillingAddressPayload, PickupAddressView, PlaceOrderPayload } from "@lfd/contracts";

import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import {
  CompanyNotActivatedError,
  OrderCompanyNotFoundError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../../domain/errors/order-errors.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
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

function guard(role: OrderRole | null, status: OrderCompanyStatus | null): OrderGuardReader {
  return {
    roleOf: () => Promise.resolve(role),
    companyStatusOf: () => Promise.resolve(status),
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

const LABO_POINT: PickupAddressView = {
  id: "pickup_1",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  isDefault: true,
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
});
