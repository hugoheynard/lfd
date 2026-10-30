/**
 * E2E : **le mur des articles réservés** (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1b, § 9).
 *
 * Ce que seul le vrai SQL prouve : la réservation lue DANS la requête du
 * catalogue (`_count` et relation filtrée), le principal relu par
 * `parent_company_id` à chaque requête et seulement s'il est actif, et le
 * même verdict au rayon, au devis, à la commande, à la révision, à
 * l'abonnement et à la mercuriale.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { PlacedOrderResponse, ShopCatalogueView, ShopItemView } from "@lfd/contracts";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { BundleChoiceCatalogue } from "../src/b2b/bundles/domain/ports/bundle-choice.catalogue.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub, scopes: [] }),
};

let intents = 0;
const fakeGateway = {
  createIntent: () => {
    intents += 1;
    const id = `pi_wall_${String(intents)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_sec` });
  },
  retrieveIntent: (paymentIntentId: string) =>
    Promise.resolve({
      paymentIntentId,
      clientSecret: `${paymentIntentId}_sec`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

/** L'article réservé : la baguette du catalogue e2e. */
const X = "PAI-001-1";
/** Un article ouvert à tous. */
const OPEN = "VIE-001-1";

const MEMBER_A = "auth0|wall-a";
const MEMBER_B = "auth0|wall-b";
const MEMBER_SITE = "auth0|wall-site";

let ctx: E2eContext;
let a = "";
let b = "";
let site = "";
let pickupId = "";
/** L'identifiant de la personne de A : la saisie au compte la nomme. */
let buyerA = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

/** A, B, et un site de A dont la personne est membre PROPRE (sans héritage). */
beforeEach(async () => {
  await ctx.reset();
  const companyA = await createCompany(ctx.prisma, { enseigne: "Maison A" });
  const companyB = await createCompany(ctx.prisma, { enseigne: "Maison B" });
  const companySite = await createCompany(ctx.prisma, { enseigne: "Antenne de A" });
  await ctx.prisma.company.update({
    where: { id: companySite.id },
    data: { parentCompanyId: companyA.id },
  });
  a = companyA.id;
  b = companyB.id;
  site = companySite.id;
  for (const [sub, companyId] of [
    [MEMBER_A, a],
    [MEMBER_B, b],
    [MEMBER_SITE, site],
  ] as const) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
    if (sub === MEMBER_A) {
      buyerA = user.id;
    }
  }
  const point = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "Route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function reserve(companyId: string, visibility: "hidden" | "visible_locked"): Promise<void> {
  await staff().put(`/admin/catalog/${X}/reservations/${companyId}`).expect(204);
  await staff().put(`/admin/catalog/${X}/reserved-visibility`).send({ visibility }).expect(204);
}

async function shelfOf(sub: string): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200));
}

const itemOf = (view: ShopCatalogueView, sku: string): ShopItemView | undefined =>
  view.items.find((item) => item.sku === sku);

const quote = (sub: string, sku: string) =>
  ctx
    .asSub(sub)
    .post("/shop/quote/mine")
    .send({ lines: [{ sku, quantity: 1 }], fulfillment: null });

function order(sku: string, idempotencyKey: string = randomUUID()): Record<string, unknown> {
  return {
    idempotencyKey,
    salesTerms: null,
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    deliveryAddress: null,
    deliveryAddressId: null,
    requestedDeliveryDate: serviceDay(),
    note: "",
    lines: [{ sku, quantity: 2 }],
  };
}

const place = (sub: string, body: Record<string, unknown>) =>
  ctx.asSub(sub).post("/orders").send(body);

describe("réservé à A, invisible aux autres (`hidden`)", () => {
  it("B ne le voit pas au rayon, et devis comme commande le traitent en inconnu", async () => {
    await reserve(a, "hidden");

    expect(itemOf(await shelfOf(MEMBER_B), X)).toBeUndefined();
    const refused = await quote(MEMBER_B, X).expect(400);
    expect(jsonBody<{ code: string }>(refused).code).toBe("orders.sku.unknown");
    await place(MEMBER_B, order(X)).expect(400);
  });

  it("A le voit commandable, et le commande", async () => {
    await reserve(a, "hidden");

    const shown = itemOf(await shelfOf(MEMBER_A), X);
    expect(shown).toBeDefined();
    expect(shown?.orderable).toBeUndefined();
    await quote(MEMBER_A, X).expect(200);
    await place(MEMBER_A, order(X)).expect(201);
  });

  it("B ne le reçoit pas en suggestion ; A, si", async () => {
    await reserve(a, "hidden");
    await staff()
      .post("/admin/suggestions")
      .send({
        trigger: { kind: "product_in_cart", ref: OPEN },
        suggestedSkus: [X],
        placement: "cart",
        audience: "both",
        startsOn: serviceDay(0),
        endsOn: serviceDay(7),
        phrase: { fr: "Avec un croissant, la baguette" },
        priority: 0,
      })
      .expect(201);
    const suggested = async (sub: string): Promise<readonly string[]> =>
      jsonBody<readonly { sku: string }[]>(
        await ctx
          .asSub(sub)
          .post("/shop/suggestions/cart/mine")
          .send({ skus: [OPEN], target: null })
          .expect(200),
      ).map((view) => view.sku);

    expect(await suggested(MEMBER_B)).not.toContain(X);
    expect(await suggested(MEMBER_A)).toContain(X);
  });

  it("un site de A l'a, pour son membre propre — tant que A est actif (Q8)", async () => {
    await reserve(a, "hidden");

    expect(itemOf(await shelfOf(MEMBER_SITE), X)).toBeDefined();
    await quote(MEMBER_SITE, X).expect(200);

    await ctx.prisma.company.update({
      where: { id: a },
      data: { status: CompanyStatus.suspended },
    });
    expect(itemOf(await shelfOf(MEMBER_SITE), X)).toBeUndefined();
  });

  it("réservé au site : le principal ne le voit pas (Q3)", async () => {
    await reserve(site, "hidden");

    expect(itemOf(await shelfOf(MEMBER_A), X)).toBeUndefined();
  });
});

describe("réservé à A, visible non commandable (`visible_locked`)", () => {
  it("B le voit verrouillé, et devis comme commande le refusent par son nom", async () => {
    await reserve(a, "visible_locked");

    expect(itemOf(await shelfOf(MEMBER_B), X)).toMatchObject({
      orderable: false,
      lockedReason: "reserved_to_other_account",
    });
    expect(itemOf(await shelfOf(MEMBER_B), OPEN)?.orderable).toBeUndefined();
    const refused = await quote(MEMBER_B, X).expect(409);
    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({
      code: "catalog.reserved_article",
    });
    expect(jsonBody<{ message: string }>(refused).message).toContain(X);
    await place(MEMBER_B, order(X)).expect(409);
  });

  it("un abonnement de B sur l'article est refusé à la création", async () => {
    await reserve(a, "visible_locked");

    const refused = await ctx
      .asSub(MEMBER_B)
      .post("/subscriptions")
      .send({
        fromOrderId: null,
        recurrence: "weekly",
        startDate: serviceDay(1),
        endDate: serviceDay(60),
        fulfillmentMethod: "pickup",
        deliveryAddress: null,
        pickupAddressId: null,
        lines: [{ sku: X, quantity: 3 }],
        note: "",
      })
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("catalog.reserved_article");
  });
});

describe("hors connexion et au public", () => {
  it.each(["hidden", "visible_locked"] as const)(
    "%s : absent du rayon pro anonyme, du rayon public, et des coffrets",
    async (visibility) => {
      await reserve(a, visibility);
      const http = () => request(ctx.app.getHttpServer());

      const pro = jsonBody<ShopCatalogueView>(
        await http().get("/shop/catalogue?audience=pro").expect(200),
      );
      const open = jsonBody<ShopCatalogueView>(await http().get("/shop/catalogue").expect(200));
      expect(itemOf(pro, X)).toBeUndefined();
      expect(itemOf(open, X)).toBeUndefined();
      expect(itemOf(open, OPEN)).toBeDefined();

      const bundles = await ctx.app
        .get(BundleChoiceCatalogue, { strict: false })
        .articlesAmong([X]);
      expect(bundles.get(X)?.verdict).toBe("not_served_to_public");
    },
  );

  it("sur mesure sans réservation : tous les pros, jamais le public (S3, S4)", async () => {
    await staff().put(`/admin/catalog/${X}/made-to-order`).send({ madeToOrder: true }).expect(204);

    expect(itemOf(await shelfOf(MEMBER_B), X)).toBeDefined();
    const open = jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );
    expect(itemOf(open, X)).toBeUndefined();
  });
});

describe("le rejeu et la révision", () => {
  it("rejoue la commande de A avec sa clé, même après le retrait de la réservation", async () => {
    await reserve(a, "visible_locked");
    const key = randomUUID();
    const first = jsonBody<PlacedOrderResponse>(await place(MEMBER_A, order(X, key)).expect(201));

    await staff().delete(`/admin/catalog/${X}/reservations/${a}`).expect(204);
    await reserve(b, "visible_locked");

    const replayed = jsonBody<PlacedOrderResponse>(
      await place(MEMBER_A, order(X, key)).expect(201),
    );
    expect(replayed.id).toBe(first.id);
    // Une commande neuve, elle, passe le mur.
    await place(MEMBER_A, order(X)).expect(409);
  });

  it("garde la ligne X d'une révision, refuse une ligne X nouvelle", async () => {
    await reserve(a, "visible_locked");
    // Au compte : une commande réglée par carte ne se révise pas.
    await ctx.prisma.company.update({
      where: { id: a },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
    const kept = await onAccount(X);
    const without = await onAccount(OPEN);

    await staff().delete(`/admin/catalog/${X}/reservations/${a}`).expect(204);
    await reserve(b, "visible_locked");

    const revise = (orderId: string, lines: readonly { sku: string; quantity: number }[]) =>
      ctx
        .asSub(MEMBER_A)
        .post(`/orders/${orderId}/revisions`)
        .send({ ...content(OPEN), expectedRevision: 0, lines: [...lines] });

    await revise(kept, [
      { sku: X, quantity: 3 },
      { sku: OPEN, quantity: 1 },
    ]).expect(200);
    const refused = await revise(without, [
      { sku: OPEN, quantity: 2 },
      { sku: X, quantity: 1 },
    ]).expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("catalog.reserved_article");
  });
});

/** Ce que la saisie et la révision partagent : un retrait au Labo, dans une semaine. */
function content(sku: string): Record<string, unknown> {
  return {
    requestedDeliveryDate: serviceDay(),
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku, quantity: 2 }],
  };
}

/** Une commande de A saisie au compte par l'équipe — révisable par le client. */
async function onAccount(sku: string): Promise<string> {
  const placed = jsonBody<{ id: string }>(
    await staff()
      .post("/admin/orders")
      .send({ companyId: a, buyerUserId: buyerA, settlement: "account", ...content(sku) })
      .expect(201),
  );
  return placed.id;
}

describe("la mercuriale (Q1)", () => {
  it("la fiche Tarifs de B ne propose pas l'article, et la pose le refuse", async () => {
    await reserve(a, "hidden");

    const pricing = jsonBody<{ categories: readonly { items: readonly { sku: string }[] }[] }>(
      await staff().get(`/admin/pricing/companies/${b}`).expect(200),
    );
    const skus = pricing.categories.flatMap((category) => category.items.map((item) => item.sku));
    expect(skus).toContain(OPEN);
    expect(skus).not.toContain(X);

    const refused = await staff()
      .post(`/admin/pricing/companies/${b}/mercuriale`)
      .send({
        label: "Mercuriale B",
        validFrom: daysAgo(1),
        validTo: daysAgo(-90),
        lines: [{ sku: X, unitPriceMillicents: 150_000 }],
      })
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("catalog.reserved_article");
  });

  it("une ligne posée avant la réservation reste, étiquetée « réservé à un autre compte »", async () => {
    await staff()
      .post(`/admin/pricing/companies/${b}/mercuriale`)
      .send({
        label: "Mercuriale B",
        validFrom: daysAgo(1),
        validTo: daysAgo(-90),
        lines: [{ sku: X, unitPriceMillicents: 150_000 }],
      })
      .expect(201);
    await reserve(a, "hidden");

    const pricing = jsonBody<{
      mercuriales: readonly { lines: readonly { sku: string; lockedReason?: string }[] }[];
    }>(await staff().get(`/admin/pricing/companies/${b}`).expect(200));
    expect(pricing.mercuriales[0]?.lines).toEqual([
      expect.objectContaining({ sku: X, lockedReason: "reserved_to_other_account" }),
    ]);
  });
});
