import { randomUUID } from "node:crypto";
/**
 * E2E de la **liste staff paginée** (`GET /admin/orders`, plan
 * `documentation/order/plan-page-commandes.md`, lot C1).
 *
 * Ce que seul le vrai SQL prouve : que le curseur ne saute ni ne répète une
 * ligne quand une commande s'insère entre deux pages ou que deux commandes
 * tombent à la même milliseconde ; que chaque filtre mord dans la requête ;
 * qu'un particulier se trouve par son nom ; et que la route reste fermée sans
 * `b2b_orders:read`.
 */
import {
  addDays,
  instantToLocal,
  type AdminOrderRow,
  type AdminOrdersPage,
  type BillingAddressPayload,
  type RoleGrant,
} from "@lfd/contracts";
import type request from "supertest";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const SERVICE_DAY = serviceDay();
const MEMBER = "auth0|member";
const SOLO = "auth0|solo";

const COURIER_ADDR: BillingAddressPayload = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Un identifiant d'intention par appel : la colonne est `@unique`. */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_list_${intentCounter}`,
      clientSecret: `pi_list_${intentCounter}_secret`,
    });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let pickupId = "pickup_absent";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: PaymentGateway, value: fakeGateway }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function list(query: string): Promise<AdminOrdersPage> {
  return jsonBody<AdminOrdersPage>(
    await ctx.asSub(E2E_STAFF_SUB).get(`/admin/orders${query}`).expect(200),
  );
}

const numbersOf = (rows: readonly AdminOrderRow[]): string[] =>
  rows.map((row) => row.orderNumber).sort();

/** Le point de retrait et la zone : sans eux, les commandes partent en 409. */
async function seedPlaces(): Promise<void> {
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
}

async function place(sub: string, body: Record<string, unknown>): Promise<string> {
  const response = await ctx
    .asSub(sub)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      requestedDeliveryDate: SERVICE_DAY,
      lines: [{ sku: "VIE-001", quantity: 1 }],
      ...body,
    })
    .expect(201);
  return jsonBody<{ orderNumber: string }>(response).orderNumber;
}

const pickup = (companyId: string | null) => ({
  companyId,
  fulfillmentMethod: "pickup",
  pickupAddressId: pickupId,
});

/**
 * Une commande pro en retrait, une commande d'une particulière (Léa Martin) en
 * retrait, une autre en livraison.
 */
async function seedScene(): Promise<{ pro: string; publicPickup: string; delivery: string }> {
  await seedPlaces();
  const company = await createCompany(ctx.prisma, {
    raisonSociale: "Café des Halles SAS",
    enseigne: "Le Comptoir",
    status: CompanyStatus.active,
  });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  await createUser(ctx.prisma, {
    auth0Sub: SOLO,
    email: "solo@exemple.fr",
    firstName: "Léa",
    lastName: "Martin",
  });
  const pro = await place(MEMBER, pickup(company.id));
  const publicPickup = await place(SOLO, pickup(null));
  const delivery = await place(SOLO, {
    companyId: null,
    fulfillmentMethod: "delivery",
    requestedWindow: { start: null, end: "10:00" },
    deliveryAddress: COURIER_ADDR,
  });
  return { pro, publicPickup, delivery };
}

describe("GET /admin/orders — pagination", () => {
  it("rend chaque commande une fois, même si une commande s'insère entre deux pages", async () => {
    const scene = await seedScene();

    const first = await list("?limit=2");
    const late = await place(SOLO, pickup(null));
    const second = await list(`?limit=2&cursor=${first.nextCursor ?? ""}`);

    expect(first.nextCursor).not.toBeNull();
    expect(second.nextCursor).toBeNull();
    expect(numbersOf([...first.rows, ...second.rows])).toEqual(
      [scene.pro, scene.publicPickup, scene.delivery].sort(),
    );
    // la retardataire attend en tête de la prochaine première page
    expect((await list("?limit=1")).rows[0]?.orderNumber).toBe(late);
  });

  it("départage deux commandes passées à la même milliseconde par leur identifiant", async () => {
    const scene = await seedScene();
    // Le tri à égalité se joue sur l'id : on fige le même instant sur les trois.
    await ctx.prisma.order.updateMany({ data: { createdAt: new Date(daysAgo(1)) } });

    const pages: AdminOrderRow[] = [];
    let cursor: string | null = "";
    while (cursor !== null) {
      const page = await list(`?limit=1${cursor === "" ? "" : `&cursor=${cursor}`}`);
      pages.push(...page.rows);
      cursor = page.nextCursor;
    }

    expect(numbersOf(pages)).toEqual([scene.pro, scene.publicPickup, scene.delivery].sort());
  });

  it("refuse un curseur bricolé en 400", async () => {
    await ctx.asSub(E2E_STAFF_SUB).get("/admin/orders?cursor=bricole").expect(400);
  });
});

describe("GET /admin/orders — filtres", () => {
  it("filtre par clientèle, et l'historique sans clientèle ne répond à aucune", async () => {
    const scene = await seedScene();
    // Une commande d'avant la distinction : la colonne est nulle pour toujours.
    await ctx.prisma.order.update({
      where: { orderNumber: scene.delivery },
      data: { clientele: null },
    });

    expect(numbersOf((await list("?clientele=pro")).rows)).toEqual([scene.pro]);
    expect(numbersOf((await list("?clientele=public")).rows)).toEqual([scene.publicPickup]);
    expect((await list("")).rows.find((row) => row.orderNumber === scene.delivery)).toMatchObject({
      clientele: null,
    });
  });

  it("filtre par mode, et porte le jour de retrait sur la ligne", async () => {
    const scene = await seedScene();

    const delivered = await list("?method=delivery");

    expect(numbersOf(delivered.rows)).toEqual([scene.delivery]);
    expect(delivered.rows[0]).toMatchObject({ fulfillmentDay: SERVICE_DAY });
    expect((await list("?method=pickup")).rows).toHaveLength(2);
  });

  it("filtre par jour de passation, à l'heure de Paris", async () => {
    await seedScene();
    const today = instantToLocal(new Date(daysAgo(0))).day;
    const yesterday = addDays(today, -1);

    expect((await list(`?placedFrom=${today}&placedTo=${today}`)).rows).toHaveLength(3);
    expect((await list(`?placedTo=${yesterday}`)).rows).toHaveLength(0);
  });

  it("filtre par jour de retrait ou de livraison", async () => {
    await seedScene();

    expect(
      (await list(`?fulfillmentFrom=${SERVICE_DAY}&fulfillmentTo=${SERVICE_DAY}`)).rows,
    ).toHaveLength(3);
    expect((await list(`?fulfillmentTo=${addDays(SERVICE_DAY, -1)}`)).rows).toHaveLength(0);
  });

  /**
   * Le règlement est lu sur une ligne qui ne bouge pas : la commande PRO. La
   * deuxième commande de la particulière (une nouvelle commande carte) remplace
   * en ASYNCHRONE sa première commande, restée impayée (`ReplaceUnsettledShopOrders`
   * l'annule, et son règlement passe à `failed`). Compter les lignes « pending »
   * sur deux appels successifs comparait donc deux états différents.
   */
  it("filtre par état et par règlement", async () => {
    const scene = await seedScene();
    const pro = (await list("?clientele=pro")).rows[0];
    const paymentStatus = pro?.paymentStatus ?? "paid";

    const byPayment = (await list(`?paymentStatus=${paymentStatus}`)).rows;

    expect(byPayment.map((row) => row.orderNumber)).toContain(scene.pro);
    expect(byPayment.every((row) => row.paymentStatus === paymentStatus)).toBe(true);
    expect((await list("?status=fulfilled")).rows).toHaveLength(0);
  });

  it("trouve un particulier par son nom, sans égard à la casse ni à l'ordre des mots", async () => {
    const scene = await seedScene();

    expect(numbersOf((await list("?q=MARTIN%20l%C3%A9a")).rows)).toEqual(
      [scene.publicPickup, scene.delivery].sort(),
    );
  });

  it("trouve par raison sociale, par enseigne et par référence", async () => {
    const scene = await seedScene();

    expect(numbersOf((await list("?q=halles")).rows)).toEqual([scene.pro]);
    expect(numbersOf((await list("?q=comptoir")).rows)).toEqual([scene.pro]);
    expect(numbersOf((await list(`?q=${scene.delivery.toLowerCase()}`)).rows)).toEqual([
      scene.delivery,
    ]);
  });
});

describe("GET /admin/orders — la porte", () => {
  /** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
  async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({ key, label: key, grants })
      .expect(201);
    const sub = `staff-${key}`;
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: key,
        email: `${key}@lfc.test`,
        role: null,
        roleKey: key,
        status: "active",
        auth0Id: sub,
      },
    });
    return ctx.asSub(sub);
  }

  it("reste fermée en 403 à qui ne lit pas les commandes", async () => {
    const agent = await holderOf("retrait-seul", [
      { resource: "handover_counter", action: "read" },
    ]);

    await agent.get("/admin/orders?clientele=public").expect(403);
  });
});
