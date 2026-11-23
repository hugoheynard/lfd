/**
 * E2E **la route de l'export des ventes** (lot E3,
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 3, § 6) :
 * `GET /exports/sales`, de bout en bout, par HTTP.
 *
 * Ce que seule l'application démarrée prouve :
 * - la clé ouvre la route, et seulement elle : absente, révoquée, échue,
 *   passée en `Bearer` ou présentée d'une adresse non admise, 401 ;
 * - un jeton staff ou client valide n'ouvre pas la route ;
 * - la période se refuse avec les mots du value object ;
 * - aucune donnée personnelle ne sort ;
 * - le CA est celui du cockpit ;
 * - D2 : le HT de chaque commande se recompose de ses parts.
 *
 * Doublées : la signature des jetons, l'encaisseur de cartes.
 */
import type { IssuedExportReaderKeyResponse } from "@lfd/contracts";
import { addDays, instantToLocal } from "@lfd/contracts";

import { OrderMetricsReader } from "../src/lafoliecoffee/growth/domain/ports/order-metrics.reader.js";
import type {
  SalesExportOrderView,
  SalesExportView,
} from "../src/lafoliecoffee/reporting/application/queries/sales-export.view.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { cardProvidersDouble } from "./card-payments.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  placedDaysAgo,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import {
  payByCard,
  pickupSite,
  placeOrder,
  placeOrderForCustomer,
  type PlacedTestOrder,
} from "./order-factory.js";

const ROUTE = "/exports/sales";
const KEY_HEADER = "x-export-key";
const CLIENT_IP = "x-lfc-client-ip";
const CENTS_PER_EURO = 100;
const DAY_MS = 24 * 60 * 60 * 1_000;

/** Ce qu'une personne a de personnel, semé pour qu'on le cherche dans la réponse. */
const PERSON = { firstName: "Zéphyrine", lastName: "Quintard", phone: "0611223344" } as const;

const cards = cardProvidersDouble("pi_export_route");
let ctx: E2eContext;
let seq = 0;
/**
 * L'adresse admise, une par test : le seau de la route (dix par minute et par
 * adresse) vit le temps de l'application, pas d'un test.
 */
let admittedIp = "203.0.113.0";
let ipSeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: CardProviders, value: cards }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  ipSeq += 1;
  admittedIp = `203.0.113.${String(ipSeq)}`;
});

/** Le jour de Paris d'il y a `days` jours. */
function dayAgo(days: number): string {
  return addDays(instantToLocal(ctx.app.get(Clock).now()).day, -days);
}

function inAYear(): string {
  return new Date(Date.now() + 365 * DAY_MS).toISOString();
}

async function issueKey(allowedIps: readonly string[] = [admittedIp]) {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/export-keys")
    .set(INTENT_KEY, freshIntent())
    .send({ label: "Direction", expiresAt: inAYear(), allowedIps })
    .expect(201);
  return jsonBody<IssuedExportReaderKeyResponse>(response);
}

/** Un appel du serveur de la Direction : la clé dans SON en-tête, depuis l'adresse admise. */
function exportCall(secret: string, from = dayAgo(2), to = dayAgo(0), ip = admittedIp) {
  return ctx.http().get(ROUTE).query({ from, to }).set(KEY_HEADER, secret).set(CLIENT_IP, ip);
}

async function person(): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, {
    auth0Sub: `auth0|export-route-${String(seq)}`,
    email: `export-route-${String(seq)}@example.test`,
    ...PERSON,
  });
  return user.id;
}

/** Une commande saisie par l'équipe pour une société, passée hier, au compte. */
async function proOrder(): Promise<PlacedTestOrder> {
  const buyerId = await person();
  const created = await createCompany(ctx.prisma, {
    raisonSociale: "SAS Altitude",
    enseigne: "Le Chalet",
    nafCode: "55.10Z",
  });
  await ctx.prisma.company.update({
    where: { id: created.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, buyerId, created.id, CustomerRole.owner);
  return placeOrderForCustomer(ctx, {
    buyerUserId: buyerId,
    companyId: created.id,
    staffUserId: E2E_STAFF_ID,
    placedAt: new Date(placedDaysAgo(1)),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    settlement: "account",
  });
}

/** Une commande d'un particulier par carte, passée hier et réglée. */
async function cardOrder(): Promise<PlacedTestOrder> {
  const placed = await placeOrder(ctx, {
    buyerUserId: await person(),
    settlement: "card",
    placedAt: new Date(placedDaysAgo(1)),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
  });
  await payByCard(ctx, placed);
  return placed;
}

const cents = (euros: number): number => Math.round(euros * CENTS_PER_EURO);
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** D2 : `subtotal − remise − bon + port + pénalité − totalHt`, en centimes. */
function htGap(order: SalesExportOrderView): number {
  return (
    cents(order.subtotalHt) -
    cents(order.discountHt) -
    cents(order.voucherHt) +
    cents(order.deliveryFeeHt) +
    cents(order.lateFeeHt) -
    cents(order.totalHt)
  );
}

describe("GET /exports/sales — la clé, et elle seule", () => {
  it("refuse sans clé (401), en nommant l'en-tête attendu", async () => {
    const response = await ctx
      .http()
      .get(ROUTE)
      .query({ from: dayAgo(1), to: dayAgo(0) })
      .set(CLIENT_IP, admittedIp)
      .expect(401);

    expect(JSON.stringify(response.body)).toContain("X-Export-Key");
  });

  it("refuse la clé passée en Bearer (401) : elle ne voyage que dans son en-tête", async () => {
    const issued = await issueKey();

    await ctx
      .asSub(issued.secret)
      .get(ROUTE)
      .query({ from: dayAgo(1), to: dayAgo(0) })
      .set(CLIENT_IP, admittedIp)
      .expect(401);
  });

  it("sert avec la clé ; refuse d'une adresse non admise, puis tout une fois révoquée", async () => {
    const issued = await issueKey();

    await exportCall(issued.secret).expect(200);
    await exportCall(issued.secret, dayAgo(2), dayAgo(0), "198.51.100.4").expect(401);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/export-keys/${issued.id}/revoke`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);

    await exportCall(issued.secret).expect(401);
  });

  it("refuse une clé échue (401)", async () => {
    const issued = await issueKey();
    const now = Date.now();
    await ctx.prisma.exportReaderKey.update({
      where: { id: issued.id },
      data: { createdAt: new Date(now - 2 * DAY_MS), expiresAt: new Date(now - DAY_MS) },
    });

    await exportCall(issued.secret).expect(401);
  });

  it("refuse un jeton staff et un jeton client valides (401) : la route n'accepte que sa clé", async () => {
    const clientSub = "auth0|export-route-client";
    await createUser(ctx.prisma, { auth0Sub: clientSub, email: "client@example.test" });
    // Les deux jetons sont valides ailleurs.
    await ctx.asSub(E2E_STAFF_SUB).get("/admin/export-keys").expect(200);
    await ctx.asSub(clientSub).get("/me").expect(200);

    for (const sub of [E2E_STAFF_SUB, clientSub]) {
      await ctx
        .asSub(sub)
        .get(ROUTE)
        .query({ from: dayAgo(1), to: dayAgo(0) })
        .set(CLIENT_IP, admittedIp)
        .expect(401);
    }
  });
});

describe("GET /exports/sales — le seau de l'API", () => {
  it("refuse au-delà de dix appels par minute depuis une même adresse (429)", async () => {
    const issued = await issueKey();

    for (let call = 0; call < 10; call += 1) {
      await exportCall(issued.secret).expect(200);
    }

    await exportCall(issued.secret).expect(429);
  });
});

describe("GET /exports/sales — la période", () => {
  it("refuse plus de 31 jours (400) avec les mots du value object", async () => {
    const issued = await issueKey();

    const response = await exportCall(issued.secret, dayAgo(31), dayAgo(0)).expect(400);

    expect(JSON.stringify(response.body)).toContain(
      "compte 32 jours ; un appel en sert 31 au plus",
    );
  });

  it("refuse une borne absente (400)", async () => {
    const issued = await issueKey();

    await ctx
      .http()
      .get(ROUTE)
      .query({ from: dayAgo(1) })
      .set(KEY_HEADER, issued.secret)
      .set(CLIENT_IP, admittedIp)
      .expect(400);
  });
});

describe("GET /exports/sales — ce qui sort", () => {
  it("🔴 ne sert aucune donnée personnelle, et le même CA que le cockpit", async () => {
    await proOrder();
    await cardOrder();
    const issued = await issueKey();

    const response = await exportCall(issued.secret).expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
    const served = JSON.stringify(response.body);
    const users = await ctx.prisma.user.findMany({ select: { email: true } });
    for (const { email } of users) {
      expect(served).not.toContain(email);
    }
    expect(served).not.toContain("@");
    expect(served).not.toContain(PERSON.firstName);
    expect(served).not.toContain(PERSON.lastName);
    expect(served).not.toContain(PERSON.phone);
    expect(served).not.toMatch(/auth0\||ligne1|codePostal|street|address|email|phone/iu);

    const view = jsonBody<SalesExportView>(response);
    const cockpit = await ctx.app.get(OrderMetricsReader).load();
    expect(view.orders.filter((order) => order.countsAsRevenue)).toHaveLength(2);
    expect(sum(view.summary.map((day) => cents(day.revenueTtc)))).toBe(sum([...cockpit.caCents]));
    expect(sum(view.summary.map((day) => cents(day.goodsHt)))).toBe(sum([...cockpit.caGoodsCents]));
  });

  it("D2 : le HT de chaque commande se recompose de ses parts, en line_ht comme en exact_ht", async () => {
    await proOrder();
    await cardOrder();
    const issued = await issueKey();

    const view = jsonBody<SalesExportView>(await exportCall(issued.secret).expect(200));

    expect(view.orders.map((order) => order.vatMethod).sort()).toEqual(["exact_ht", "line_ht"]);
    expect(view.orders.map((order) => ({ vatMethod: order.vatMethod, gap: htGap(order) }))).toEqual(
      view.orders.map((order) => ({ vatMethod: order.vatMethod, gap: 0 })),
    );
  });
});
