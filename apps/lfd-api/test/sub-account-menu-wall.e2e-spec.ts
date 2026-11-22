/**
 * E2E : **la carte d'un sous-compte, jugée** (plan
 * `documentation/comptes-client/carte-des-sites.md`, § 3.4 à § 3.7,
 * lot C2).
 *
 * Ce que seul le vrai SQL prouve : la carte lue dans la même requête que la
 * société servie, appliquée sur la famille réelle de l'article, et le même
 * verdict au rayon, au devis, à la commande, à la saisie staff, à
 * l'abonnement et à la révision. Elle dort sous un principal suspendu, et ne
 * touche pas le principal lui-même.
 *
 * La carte est écrite par le dépôt de l'agrégat (les routes viennent en C3),
 * avant toute lecture du rayon : aucun cache n'a encore rien gardé.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";
import { randomUUID } from "node:crypto";
import type { Response } from "supertest";

import { SubAccountMenu } from "../src/lafoliecoffee/account/domain/entities/sub-account-menu.js";
import type {
  MenuStamp,
  OffMenuDisplay,
} from "../src/lafoliecoffee/account/domain/value-objects/sub-account-menu-terms.js";
import { PrismaSubAccountMenuRepository } from "../src/lafoliecoffee/account/infrastructure/prisma-sub-account-menu.repository.js";
import { ShelfChanges } from "../src/lafoliecoffee/shared/shelf-changes/domain/ports/shelf-changes.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub, scopes: [] }),
};

/** Les signaux des rayons : le dépôt les émet, ce test ne les lit pas. */
class SilentShelfChanges extends ShelfChanges {
  changed(): void {}
}

/** L'article hors carte : la baguette du catalogue e2e, fermée par sa famille. */
const X = "PAI-001-1";
/** Un article d'une autre famille, resté dans la carte. */
const OPEN = "VIE-001-1";

const MEMBER_PRINCIPAL = "auth0|menu-principal";
const MEMBER_SITE = "auth0|menu-site";

const STAMP: MenuStamp = { author: { kind: "staff", staffId: "stf_menu" }, at: new Date(0) };

let ctx: E2eContext;
let principal = "";
let site = "";
let buyerSite = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cardGatewayDouble("pi_menu") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  principal = (await createCompany(ctx.prisma, { enseigne: "Club" })).id;
  site = (await createCompany(ctx.prisma, { enseigne: "Chalet du Club" })).id;
  await ctx.prisma.company.update({ where: { id: site }, data: { parentCompanyId: principal } });
  for (const [sub, companyId] of [
    [MEMBER_PRINCIPAL, principal],
    [MEMBER_SITE, site],
  ] as const) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
    if (sub === MEMBER_SITE) {
      buyerSite = user.id;
    }
  }
  pickupId = (
    await ctx.prisma.site.create({
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
    })
  ).id;
});

/** « Tout sauf la famille de X », sur le site. */
async function closeFamilyOfX(offMenu: OffMenuDisplay): Promise<void> {
  const item = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { sku: X },
    select: { categoryId: true },
  });
  const menu = SubAccountMenu.compose({
    companyId: site,
    principalCompanyId: principal,
    mode: "except",
    offMenu,
    stamp: STAMP,
  });
  menu.exclude({ id: "ent_family", level: "family", ref: item.categoryId }, STAMP);
  await new PrismaSubAccountMenuRepository(ctx.prisma, new SilentShelfChanges()).save(menu);
}

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

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

/** Ce que la passation, la saisie et la révision partagent : un retrait au Labo. */
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

const place = (sub: string, sku: string) =>
  ctx
    .asSub(sub)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      ...content(sku),
    });

/** Une commande du site saisie au compte par l'équipe. */
const enterForSite = (sku: string) =>
  staff()
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
    .send({ companyId: site, buyerUserId: buyerSite, settlement: "account", ...content(sku) });

const code = (response: Response): string => jsonBody<{ code: string }>(response).code;

describe("hors carte, verrouillé (`visible_locked`)", () => {
  it("le rayon du site le verrouille ; devis et passation le refusent par son nom", async () => {
    await closeFamilyOfX("visible_locked");

    const shelf = await shelfOf(MEMBER_SITE);
    expect(itemOf(shelf, X)).toMatchObject({ orderable: false, lockedReason: "off_menu" });
    expect(itemOf(shelf, OPEN)?.orderable).toBeUndefined();
    const refused = await quote(MEMBER_SITE, X).expect(409);
    expect(code(refused)).toBe("catalog.article_off_menu");
    expect(jsonBody<{ message: string }>(refused).message).toContain(X);
    expect(code(await place(MEMBER_SITE, X).expect(409))).toBe("catalog.article_off_menu");
    await place(MEMBER_SITE, OPEN).expect(201);
  });

  it("la saisie staff au nom du site le refuse aussi — sans dérogation (Q2)", async () => {
    await closeFamilyOfX("visible_locked");
    expect(code(await enterForSite(X).expect(409))).toBe("catalog.article_off_menu");
  });

  it("un abonnement du site sur l'article est refusé à la création", async () => {
    await closeFamilyOfX("visible_locked");
    const refused = await ctx
      .asSub(MEMBER_SITE)
      .post("/subscriptions")
      .set(INTENT_KEY, freshIntent())
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
    expect(code(refused)).toBe("catalog.article_off_menu");
  });

  it("une révision garde la ligne devenue hors carte, refuse la même ajoutée", async () => {
    await ctx.prisma.company.update({
      where: { id: site },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
    const kept = jsonBody<{ id: string }>(await enterForSite(X).expect(201)).id;
    const without = jsonBody<{ id: string }>(await enterForSite(OPEN).expect(201)).id;
    await closeFamilyOfX("visible_locked");

    const revise = (orderId: string, lines: readonly { sku: string; quantity: number }[]) =>
      ctx
        .asSub(MEMBER_SITE)
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
    expect(code(refused)).toBe("catalog.article_off_menu");
  });
});

describe("hors carte, masqué (`hidden`)", () => {
  it("le rayon du site ne le montre pas, et la passation le traite en inconnu", async () => {
    await closeFamilyOfX("hidden");

    expect(itemOf(await shelfOf(MEMBER_SITE), X)).toBeUndefined();
    expect(itemOf(await shelfOf(MEMBER_SITE), OPEN)).toBeDefined();
    expect(code(await quote(MEMBER_SITE, X).expect(400))).toBe("orders.sku.unknown");
    await place(MEMBER_SITE, X).expect(400);
  });
});

describe("ceux que la carte ne touche pas", () => {
  it("le principal lui-même commande l'article", async () => {
    await closeFamilyOfX("hidden");

    expect(itemOf(await shelfOf(MEMBER_PRINCIPAL), X)?.orderable).toBeUndefined();
    await place(MEMBER_PRINCIPAL, X).expect(201);
  });

  it("sous un principal suspendu, la carte dort : le site commande l'article", async () => {
    await closeFamilyOfX("visible_locked");
    await ctx.prisma.company.update({
      where: { id: principal },
      data: { status: CompanyStatus.suspended },
    });

    expect(itemOf(await shelfOf(MEMBER_SITE), X)?.orderable).toBeUndefined();
    await place(MEMBER_SITE, X).expect(201);
  });
});
