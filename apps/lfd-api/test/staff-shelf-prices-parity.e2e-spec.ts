/**
 * E2E de **la liste de l'équipe au prix du client** (plan
 * `documentation/commandes/passation/plan-liste-au-prix-du-client.md`, L1, L3).
 *
 * Ce que seule la vraie application prouve : la table que le staff lit
 * (`GET /admin/catalog/companies/:companyId/shelf-prices`) est, SKU par SKU,
 * le rayon reconnu que le client lit avec son jeton (`GET /shop/catalogue/mine`)
 * — mercuriale, sous-compte et articles réservés compris. Une divergence
 * future rougit ici.
 *
 * Les dates sont relatives à maintenant (`daysAgo`) : aucune n'est écrite en dur.
 */
import type {
  CustomerShelfPricesView,
  GeneralDiscountPayload,
  RoleGrant,
  ShopCatalogueView,
} from "@lfd/contracts";
import type request from "supertest";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/** L'article réservé : la baguette du catalogue e2e. */
const RESERVED = "PAI-001-1";
/** Un article ouvert à tous : le croissant. */
const OPEN = "VIE-001-1";

const MEMBER_HEAD = "auth0|parity-head";
const MEMBER_SITE = "auth0|parity-site";
const MEMBER_OTHER = "auth0|parity-other";

/** −30 % sur tout le catalogue. */
const THIRTY_OFF: GeneralDiscountPayload = { mode: "all_except", baseBp: 3_000, rules: [] };

let ctx: E2eContext;
let head = "";
let site = "";
let other = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

/** Une maison à mercuriale, un de ses sites, et une autre maison. */
beforeEach(async () => {
  await ctx.reset();
  head = (await createCompany(ctx.prisma, { enseigne: "Maison négociée" })).id;
  site = (await createCompany(ctx.prisma, { enseigne: "Antenne" })).id;
  other = (await createCompany(ctx.prisma, { enseigne: "Maison voisine" })).id;
  await ctx.prisma.company.update({ where: { id: site }, data: { parentCompanyId: head } });
  for (const [sub, companyId] of [
    [MEMBER_HEAD, head],
    [MEMBER_SITE, site],
    [MEMBER_OTHER, other],
  ] as const) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
  }
  await staff()
    .post(`/admin/pricing/companies/${head}/mercuriale`)
    .set(INTENT_KEY, freshIntent())
    .send({
      label: "Remise négociée",
      validFrom: daysAgo(30),
      validTo: null,
      lines: [],
      generalDiscount: THIRTY_OFF,
    })
    .expect(201);
});

const staff = (): request.Agent => ctx.asSub(E2E_STAFF_SUB);

async function staffTable(companyId: string): Promise<CustomerShelfPricesView> {
  return jsonBody<CustomerShelfPricesView>(
    await staff().get(`/admin/catalog/companies/${companyId}/shelf-prices`).expect(200),
  );
}

async function clientShelf(sub: string): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200));
}

/** Le rayon du client, réduit à ce que la table du staff en reprend. */
function asTable(view: ShopCatalogueView): CustomerShelfPricesView["items"] {
  return view.items.map((item) => ({
    sku: item.sku,
    unitPriceMillicents: item.unitPriceMillicents,
    struckFromMillicents: item.catalogPriceMillicents ?? null,
    unitPriceTtcCents: item.unitPriceTtcCents,
    struckFromTtcCents: item.catalogPriceTtcCents ?? null,
    lockedReason: item.lockedReason ?? null,
  }));
}

async function expectParity(companyId: string, sub: string): Promise<CustomerShelfPricesView> {
  const table = await staffTable(companyId);
  expect(table.items).toEqual(asTable(await clientShelf(sub)));
  expect(table.items.length).toBeGreaterThan(0);
  return table;
}

async function reserve(companyId: string, visibility: "hidden" | "visible_locked"): Promise<void> {
  await staff().put(`/admin/catalog/${RESERVED}/reservations/${companyId}`).expect(204);
  await staff()
    .put(`/admin/catalog/${RESERVED}/reserved-visibility`)
    .send({ visibility })
    .expect(204);
}

const entryOf = (table: CustomerShelfPricesView, sku: string) =>
  table.items.find((item) => item.sku === sku);

describe("la table du staff est le rayon reconnu du client", () => {
  it("à mercuriale −30 % : mêmes prix SKU par SKU, le tarif barré, en pro", async () => {
    const table = await expectParity(head, MEMBER_HEAD);

    expect(table.audience).toBe("pro");
    const open = entryOf(table, OPEN);
    expect(open?.struckFromMillicents).not.toBeNull();
    expect(open?.struckFromTtcCents).not.toBeNull();
    expect(open?.unitPriceTtcCents).toBeGreaterThan(0);
    expect(open?.unitPriceMillicents).toBe(Math.round((open?.struckFromMillicents ?? 0) * 0.7));
  });

  it("un sous-compte : la table de son site est le rayon de son membre", async () => {
    await expectParity(site, MEMBER_SITE);
  });

  it("réservé à une autre société, `hidden` : absent des deux côtés", async () => {
    await reserve(other, "hidden");

    const table = await expectParity(head, MEMBER_HEAD);
    expect(entryOf(table, RESERVED)).toBeUndefined();
  });

  it("réservé à une autre société, `visible_locked` : verrouillé des deux côtés", async () => {
    await reserve(other, "visible_locked");

    const table = await expectParity(head, MEMBER_HEAD);
    expect(entryOf(table, RESERVED)?.lockedReason).toBe("reserved_to_other_account");
  });
});

describe("les refus, avant toute lecture du rayon", () => {
  it("société inconnue → 404", async () => {
    await staff().get("/admin/catalog/companies/societe-inconnue/shelf-prices").expect(404);
  });

  it("société terminée → 409, le refus de la passation", async () => {
    await ctx.prisma.company.update({
      where: { id: other },
      data: { status: CompanyStatus.terminated },
    });

    const refused = await staff().get(`/admin/catalog/companies/${other}/shelf-prices`).expect(409);
    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({
      code: "orders.staff_entry.company_closed",
    });
    expect(jsonBody<{ message: string }>(refused).message).not.toContain("espace personnel");
  });

  it("sans `b2b_place_order:write` → 403, même en lisant les commandes", async () => {
    const grants: readonly RoleGrant[] = [
      { resource: "b2b_orders", action: "read" },
      { resource: "b2b_place_order", action: "read" },
    ];
    await staff()
      .post("/admin/staff-roles")
      .send({ key: "lecture-seule", label: "lecture-seule", grants })
      .expect(201);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture-seule",
        email: "lecture-seule@lfc.test",
        role: null,
        roleKey: "lecture-seule",
        status: "active",
        auth0Id: "staff-lecture-seule",
      },
    });

    await ctx
      .asSub("staff-lecture-seule")
      .get(`/admin/catalog/companies/${head}/shelf-prices`)
      .expect(403);
  });
});
