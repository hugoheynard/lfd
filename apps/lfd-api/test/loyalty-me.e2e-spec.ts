/**
 * E2E de **Ma fidélité** — l'espace du particulier (plan
 * `documentation/comptabilite/plan-points-de-fidelite.md`, lot E1, §12 E1.4).
 *
 * Ce que seul le vrai Postgres prouve :
 * - le mur : une personne ne lit ni ne convertit que SES points ; un espace
 *   société lit `open: false` et se voit refuser la conversion (403) ;
 * - le programme fermé : rien à lire, rien à convertir ;
 * - le double clic : deux POST avec le même solde attendu font 201 puis 409,
 *   et un seul bon — le second relit le solde SOUS le verrou ;
 * - le devis connecté annonce les points par la règle du crédit, et le devis
 *   anonyme ne porte pas la clé.
 *
 * Les points de départ viennent de l'ajustement motivé, la vraie route staff ;
 * la commande définitive d'un gain est semée par Prisma, faute d'agrégat qui
 * sache l'écrire à cet état (même dette que `loyalty-voucher-order.e2e-spec.ts`).
 */
import type {
  MyLoyaltyConversionResponse,
  MyLoyaltyView,
  MyShopQuoteView,
  SetLoyaltySettingsPayload,
  ShopQuoteView,
} from "@lfd/contracts";
import request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** Un palier : 1 000 points valent 5 € HT. */
const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

const CLIENT = "auth0|fidele-moi";
const OTHER = "auth0|fidele-voisin";
const MEMBER = "auth0|fidele-societe";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function openProgram(settings: SetLoyaltySettingsPayload = SETTINGS): Promise<void> {
  await staff().put("/admin/accounting/loyalty/settings").send(settings).expect(204);
}

/** Une personne, et `points` à son livre par un ajustement motivé. */
async function personWith(sub: string, points: number): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub, firstName: "Léa" });
  if (points !== 0) {
    await staff()
      .post("/admin/accounting/loyalty/adjustments")
      .send({ holderKind: "user", holderId: user.id, points, reason: "reprise du carnet papier" })
      .expect(204);
  }
  return user.id;
}

async function myLoyalty(sub: string): Promise<MyLoyaltyView> {
  return jsonBody<MyLoyaltyView>(await ctx.asSub(sub).get("/me/loyalty").expect(200));
}

const convert = (sub: string, steps: number, expectedBalancePoints: number) =>
  ctx.asSub(sub).post("/me/loyalty/conversions").send({ steps, expectedBalancePoints });

function opened(view: MyLoyaltyView): Extract<MyLoyaltyView, { open: true }> {
  if (!view.open) {
    throw new TypeError("La fidélité devait être ouverte.");
  }
  return view;
}

describe("GET me/loyalty", () => {
  it("rend le solde, le ratio et les paliers convertibles de la personne", async () => {
    await openProgram();
    await personWith(CLIENT, 2_340);

    expect(opened(await myLoyalty(CLIENT))).toMatchObject({
      balancePoints: 2_340,
      pointsPerStep: 1_000,
      stepValueCents: 500,
      convertibleSteps: 2,
      vouchers: [],
    });
  });

  it("dit l'ajustement sans son motif staff", async () => {
    await openProgram();
    await personWith(CLIENT, 1_200);

    const { entries } = opened(await myLoyalty(CLIENT));

    expect(entries).toEqual([
      expect.objectContaining({ kind: "adjusted", points: 1_200, orderNumber: null }),
    ]);
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual([
      "id",
      "kind",
      "occurredAt",
      "orderNumber",
      "points",
    ]);
    expect(JSON.stringify(entries)).not.toContain("carnet papier");
  });

  it("nomme la commande qui a rapporté les points", async () => {
    await openProgram();
    const userId = await personWith(CLIENT, 0);
    await ctx.prisma.order.create({
      data: {
        orderNumber: "CMD-FIDELE-1",
        placedByUserId: userId,
        clientele: OrderClientele.public,
        status: OrderStatus.fulfilled,
        subtotalCents: 2_000,
        discountCents: 0,
        totalCents: 2_000,
        paymentStatus: PaymentStatus.paid,
        stripePaymentIntentId: "pi_fidele_1",
        requestedDeliveryDate: new Date(serviceDay()),
      },
    });
    await ctx
      .http()
      .post("/admin/loyalty/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    const { entries, balancePoints } = opened(await myLoyalty(CLIENT));

    expect(balancePoints).toBe(2_000);
    expect(entries).toEqual([
      expect.objectContaining({ kind: "earned", points: 2_000, orderNumber: "CMD-FIDELE-1" }),
    ]);
  });

  it("🔴 le mur : une personne ne voit rien du livre d'une autre", async () => {
    await openProgram();
    await personWith(CLIENT, 5_000);
    await personWith(OTHER, 0);

    expect(opened(await myLoyalty(OTHER))).toMatchObject({ balancePoints: 0, entries: [] });
  });

  it("programme sans réglage : fermé", async () => {
    await personWith(CLIENT, 0);
    expect(await myLoyalty(CLIENT)).toEqual({ open: false });
  });

  it("programme fermé au public : fermé", async () => {
    await openProgram({ ...SETTINGS, openToPublic: false });
    await personWith(CLIENT, 0);
    expect(await myLoyalty(CLIENT)).toEqual({ open: false });
  });

  it("🔴 un espace société lit la fidélité fermée", async () => {
    await openProgram();
    await companyMember();
    expect(await myLoyalty(MEMBER)).toEqual({ open: false });
  });
});

describe("POST me/loyalty/conversions", () => {
  it("émet un bon au nom de la personne du principal", async () => {
    await openProgram();
    const userId = await personWith(CLIENT, 2_340);

    const { voucherId } = jsonBody<MyLoyaltyConversionResponse>(
      await convert(CLIENT, 2, 2_340).expect(201),
    );

    const voucher = await ctx.prisma.loyaltyVoucher.findUniqueOrThrow({ where: { id: voucherId } });
    expect(voucher).toMatchObject({ userId, companyId: null, valueCents: 1_000 });
    const view = opened(await myLoyalty(CLIENT));
    expect(view.balancePoints).toBe(340);
    expect(view.vouchers).toEqual([
      expect.objectContaining({
        id: voucherId,
        valueCents: 1_000,
        status: "available",
        usedOn: null,
      }),
    ]);
  });

  it("🔴 le double clic : 201 puis 409, un seul bon", async () => {
    await openProgram();
    await personWith(CLIENT, 2_340);

    await convert(CLIENT, 1, 2_340).expect(201);
    const second = await convert(CLIENT, 1, 2_340).expect(409);

    expect(jsonBody<{ code: string }>(second).code).toBe("loyalty.balance_changed");
    expect(await ctx.prisma.loyaltyVoucher.count()).toBe(1);
    expect(opened(await myLoyalty(CLIENT)).balancePoints).toBe(1_340);
  });

  it("🔴 deux clics simultanés : un seul bon", async () => {
    await openProgram();
    await personWith(CLIENT, 2_340);

    const statuses = (
      await Promise.all([convert(CLIENT, 1, 2_340), convert(CLIENT, 1, 2_340)])
    ).map((response) => response.status);

    expect(statuses.sort()).toEqual([201, 409]);
    expect(await ctx.prisma.loyaltyVoucher.count()).toBe(1);
  });

  it("🔴 le mur : le titulaire vient du principal — une personne sans points ne convertit rien", async () => {
    await openProgram();
    await personWith(CLIENT, 5_000);
    await personWith(OTHER, 0);

    await convert(OTHER, 1, 0).expect(409);

    expect(await ctx.prisma.loyaltyVoucher.count()).toBe(0);
    expect(opened(await myLoyalty(CLIENT)).balancePoints).toBe(5_000);
  });

  it("programme fermé : 409, rien d'écrit", async () => {
    await personWith(CLIENT, 5_000);

    const response = await convert(CLIENT, 1, 5_000).expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("loyalty.program_closed");
    expect(await ctx.prisma.loyaltyVoucher.count()).toBe(0);
  });

  it("🔴 un espace société : 403", async () => {
    await openProgram();
    await companyMember();

    const response = await convert(MEMBER, 1, 0).expect(403);

    expect(jsonBody<{ code: string }>(response).code).toBe("loyalty.personal_space_required");
  });

  it("refuse un corps mal formé (400)", async () => {
    await openProgram();
    await personWith(CLIENT, 5_000);
    await ctx.asSub(CLIENT).post("/me/loyalty/conversions").send({ steps: 1 }).expect(400);
    await convert(CLIENT, 0, 5_000).expect(400);
  });
});

describe("le devis connecté : « vous gagnerez N points »", () => {
  const CART = { lines: [{ sku: "VIE-001", quantity: 10 }], fulfillment: null };

  it("annonce le HT des marchandises, par la règle du crédit", async () => {
    await openProgram();
    await personWith(CLIENT, 0);

    const view = jsonBody<MyShopQuoteView>(
      await ctx.asSub(CLIENT).post("/shop/quote/mine").send(CART).expect(200),
    );

    expect(view.loyaltyPointsToEarn).toBe(
      view.subtotalHtCents - view.discountCents - view.voucherDiscountCents,
    );
    expect(view.loyaltyPointsToEarn).toBeGreaterThan(0);
  });

  it("nul sans programme", async () => {
    await personWith(CLIENT, 0);
    const view = jsonBody<MyShopQuoteView>(
      await ctx.asSub(CLIENT).post("/shop/quote/mine").send(CART).expect(200),
    );
    expect(view.loyaltyPointsToEarn).toBeNull();
  });

  it("nul depuis un espace société", async () => {
    await openProgram();
    await companyMember();
    const view = jsonBody<MyShopQuoteView>(
      await ctx.asSub(MEMBER).post("/shop/quote/mine").send(CART).expect(200),
    );
    expect(view.loyaltyPointsToEarn).toBeNull();
  });

  it("le devis anonyme ne porte pas la clé", async () => {
    await openProgram();
    const view = jsonBody<ShopQuoteView>(
      await request(ctx.app.getHttpServer()).post("/shop/quote").send(CART).expect(200),
    );
    expect(Object.keys(view)).not.toContain("loyaltyPointsToEarn");
  });
});

/** Une personne rattachée à UNE société active : son espace courant est la société. */
async function companyMember(): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
}
