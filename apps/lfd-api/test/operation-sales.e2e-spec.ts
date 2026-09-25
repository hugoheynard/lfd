import { randomUUID } from "node:crypto";

import type { SyncOperation } from "@lfd/catalog-sync";
import type { FulfillmentDayView, ShopCatalogueView } from "@lfd/contracts";
import request from "supertest";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { ProductCatalogReader } from "../src/b2b/catalog/domain/ports/product-catalog.reader.js";
import { OrderOperations } from "../src/b2b/orders/application/services/order-operations.service.js";
import { OperationDayRequiredError } from "../src/b2b/orders/domain/errors/order-operation-errors.js";
import { WorkshopShelvesReader } from "../src/production/channels/commerce/workshop-shelves.reader.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/**
 * **Le drapeau `operationOnly` devient une règle de vente** (lot 3 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Ce que seul ce niveau prouve : une bûche reçue par un VRAI envoi v11 est
 * écartée du rayon et refusée à la caisse hors de son opération, sur le vrai
 * miroir et la vraie surcharge ; la fiche atelier et la tarification la voient
 * toujours ; le croissant de la même opération reste commandable après sa
 * clôture.
 *
 * 🔴 Toutes les dates sont RELATIVES à maintenant : la règle les compare à
 * l'horloge, et une date en dur deviendrait un refus que rien n'expliquerait.
 */

const MEMBER = "auth0|op-member";
const STAFF = "staff-e2e";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_op_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  publishableKey: () => "pk_op",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;
let companyId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  companyId = company.id;
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

/** Les jours de retrait de l'opération ouverte : dans huit à dix jours. */
const PICKUP_FROM = serviceDay(8);
const PICKUP_UNTIL = serviceDay(10);

/** Noël, OUVERT : annoncé il y a dix jours, clos dans cinq. */
function noel(over: Partial<SyncOperation> = {}): SyncOperation {
  return {
    key: "noel",
    name: { fr: "Noël" },
    lede: null,
    image: null,
    announceFrom: daysAgo(10),
    orderFrom: null,
    orderUntil: daysAgo(-5),
    pickupFrom: PICKUP_FROM,
    pickupUntil: PICKUP_UNTIL,
    audience: "both",
    skus: ["PAT-002-1", "VIE-001-1"],
    ...over,
  };
}

/** Un envoi v11 accepté : le croissant courant, la bûche réservée aux opérations. */
async function receive(operations: readonly SyncOperation[]): Promise<void> {
  await ctx.app.get(B2bCatalogDriver).send(
    snapshotOf(
      [
        { sku: "VIE-001", priceMillicents: 210_000 },
        { sku: "PAT-002", priceMillicents: 2_900_000, operationOnly: true },
      ],
      [],
      operations,
    ),
    { revisionId: `rev_${randomUUID()}`, fingerprint: `empreinte-${randomUUID()}` },
  );
}

async function publicShelf(): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(
    await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
  );
}

async function proShelf(): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(
    await ctx.asSub(MEMBER).get("/shop/catalogue/mine").set("x-lfc-company", companyId).expect(200),
  );
}

const skusOf = (view: ShopCatalogueView): string[] => view.items.map((item) => item.sku);

function order(sku: string, day: string) {
  return ctx
    .asSub(MEMBER)
    .post("/orders")
    .send({
      companyId,
      idempotencyKey: randomUUID(),
      pickupAddressId: pickupId,
      requestedDeliveryDate: day,
      fulfillmentMethod: "pickup",
      note: "",
      lines: [{ sku, quantity: 1 }],
    });
}

const restrict = (body: Record<string, unknown>) =>
  ctx
    .asSub(STAFF)
    .put("/admin/catalog/operations/noel/override")
    .send({ isHidden: false, orderUntil: null, audience: null, hiddenSkus: [], ...body })
    .expect(204);

describe("hors de toute fenêtre", () => {
  beforeEach(async () => {
    // Annoncée dans vingt jours : en préparation, invisible.
    await receive([
      noel({
        announceFrom: daysAgo(-20),
        orderUntil: daysAgo(-40),
        pickupFrom: serviceDay(41),
        pickupUntil: serviceDay(43),
      }),
    ]);
  });

  it("la bûche est absente du rayon, et aucune opération n'est montrée", async () => {
    const view = await publicShelf();
    expect(skusOf(view)).toEqual(["VIE-001"]);
    expect(view.operations).toEqual([]);
  });

  it("la commande la refuse sans la dire inconnue", async () => {
    const response = await order("PAT-002", serviceDay(41)).expect(409);
    expect(response.body).toMatchObject({ code: "orders.operation.absent" });
  });

  it("la fiche atelier et la tarification la voient toujours (D5)", async () => {
    const shelves = await ctx.app.get(WorkshopShelvesReader).shelvesOf(["PAT-002"]);
    expect(shelves.has("PAT-002")).toBe(true);
    expect(await ctx.app.get(ProductCatalogReader).resolve("PAT-002", "pro")).not.toBeNull();
  });
});

describe("pendant la fenêtre", () => {
  it("la bûche paraît au rayon, sa carte dit « ouverte », le rayon op: la liste", async () => {
    await receive([noel()]);

    const view = await publicShelf();
    expect(skusOf(view).sort()).toEqual(["PAT-002", "VIE-001"]);
    expect(view.items.find((item) => item.sku === "PAT-002")?.operation).toEqual({
      key: "noel",
      state: "open",
    });
    expect(view.operations).toMatchObject([
      { key: "noel", state: "open", pickupFrom: PICKUP_FROM, skus: ["PAT-002", "VIE-001"] },
    ]);
  });

  it("se commande pour un jour de retrait de l'opération", async () => {
    await receive([noel()]);
    await order("PAT-002", PICKUP_FROM).expect(201);
  });

  it("refuse un jour hors des jours de retrait", async () => {
    await receive([noel()]);
    const response = await order("PAT-002", serviceDay(12)).expect(409);
    expect(response.body).toMatchObject({ code: "orders.operation.day_outside" });
  });

  it("refuse une commande sans jour de retrait", async () => {
    await receive([noel()]);
    await expect(
      ctx.app.get(OrderOperations).ensure([{ sku: "PAT-002" }], companyId, null),
    ).rejects.toBeInstanceOf(OperationDayRequiredError);
  });

  it("ne propose que les jours de retrait de l'opération", async () => {
    await receive([noel()]);
    const days = jsonBody<FulfillmentDayView[]>(
      await request(ctx.app.getHttpServer())
        .get("/fulfillment-days?skus=VIE-001,PAT-002")
        .expect(200),
    );
    expect(days.map((day) => day.date)).toEqual(days.map(() => PICKUP_FROM));
  });
});

describe("la clientèle de l'opération (D7)", () => {
  it("réservée aux pros : absente de la vitrine publique, présente pour une société", async () => {
    await receive([noel({ audience: "pro" })]);

    expect(skusOf(await publicShelf())).toEqual(["VIE-001"]);
    expect(skusOf(await proShelf()).sort()).toEqual(["PAT-002", "VIE-001"]);
    await order("PAT-002", PICKUP_FROM).expect(201);
  });
});

describe("avant l'ouverture, après la clôture", () => {
  it("refuse avant orderFrom", async () => {
    await receive([noel({ announceFrom: daysAgo(2), orderFrom: daysAgo(-3) })]);

    expect((await publicShelf()).items.find((item) => item.sku === "PAT-002")?.operation).toEqual({
      key: "noel",
      state: "announced",
    });
    const response = await order("PAT-002", PICKUP_FROM).expect(409);
    expect(response.body).toMatchObject({ code: "orders.operation.not_yet_open" });
  });

  it("refuse après orderUntil — et le devis le dit déjà", async () => {
    await receive([
      noel({ orderUntil: daysAgo(1), pickupFrom: serviceDay(3), pickupUntil: serviceDay(5) }),
    ]);

    const response = await order("PAT-002", serviceDay(3)).expect(409);
    expect(response.body).toMatchObject({ code: "orders.operation.closed" });
    const quote = await request(ctx.app.getHttpServer())
      .post("/shop/quote")
      .send({ lines: [{ sku: "PAT-002", quantity: 1 }], fulfillment: null })
      .expect(409);
    expect(quote.body).toMatchObject({ code: "orders.operation.closed" });
  });

  it("le croissant de l'opération reste commandable après la clôture, hors des jours", async () => {
    await receive([
      noel({ orderUntil: daysAgo(1), pickupFrom: serviceDay(3), pickupUntil: serviceDay(5) }),
    ]);
    await order("VIE-001", serviceDay(6)).expect(201);
  });
});

describe("la surcharge de la réception (D9)", () => {
  it("une clôture avancée à hier ferme la commande", async () => {
    await receive([noel()]);
    await restrict({ orderUntil: daysAgo(1) });

    const response = await order("PAT-002", PICKUP_FROM).expect(409);
    expect(response.body).toMatchObject({ code: "orders.operation.closed" });
  });

  it("une opération masquée rend la bûche absente — jamais libre", async () => {
    await receive([noel()]);
    await restrict({ isHidden: true });

    expect(skusOf(await publicShelf())).toEqual(["VIE-001"]);
    const response = await order("PAT-002", PICKUP_FROM).expect(409);
    expect(response.body).toMatchObject({ code: "orders.operation.absent" });
  });

  it("un article retiré de la sélection devient absent", async () => {
    await receive([noel()]);
    await restrict({ hiddenSkus: ["PAT-002-1"] });

    expect(skusOf(await publicShelf())).toEqual(["VIE-001"]);
    await order("PAT-002", PICKUP_FROM).expect(409);
  });
});

describe("les abonnements (D6)", () => {
  it("refusent un article d'opération datée à la création", async () => {
    await receive([noel()]);

    const response = await ctx
      .asSub(MEMBER)
      .post("/subscriptions")
      .send({
        fromOrderId: null,
        recurrence: "weekly",
        startDate: serviceDay(8),
        endDate: null,
        fulfillmentMethod: "pickup",
        deliveryAddress: null,
        pickupAddressId: null,
        lines: [{ sku: "PAT-002", quantity: 1 }],
        note: "",
      })
      .expect(409);
    expect(response.body).toMatchObject({ code: "subscriptions.operation_only" });
  });
});
