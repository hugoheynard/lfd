/**
 * E2E : **les routes de la carte d'un sous-compte** (plan
 * `documentation/comptes-client/carte-des-sites.md`, § 3.2, § 4, § 7,
 * lot C3).
 *
 * - le propriétaire et l'admin du principal l'écrivent ; un membre du site,
 *   même son propriétaire, est refusé en écriture (403) et la lit — le test qui tombe si quelqu'un
 *   juge par le rôle effectif ; un `orders` du principal aussi ;
 * - un principal étranger reçoit le refus d'une société inconnue (mur tenant) ;
 * - le staff l'écrit depuis la fiche, et la relit ;
 * - la carte écrite change le rayon du site, lu AVANT puis APRÈS : le cache
 *   des rayons a été purgé par l'écriture.
 *
 * Doublée : la signature des jetons (le jeton EST le `sub`).
 */
import type { ShopCatalogueView, SubAccountMenuPayload, SubAccountMenuView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub, scopes: [] }),
};

/** L'article que la carte fermera, par sa famille. */
const X = "PAI-001-1";

const PRINCIPAL_OWNER = "auth0|routes-principal-owner";
const PRINCIPAL_ADMIN = "auth0|routes-principal-admin";
const PRINCIPAL_ORDERS = "auth0|routes-principal-orders";
const SITE_OWNER = "auth0|routes-site-owner";
const STRANGER = "auth0|routes-stranger";

let ctx: E2eContext;
let site = "";

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
  const principal = (await createCompany(ctx.prisma, { enseigne: "Club" })).id;
  site = (await createCompany(ctx.prisma, { enseigne: "Chalet du Club" })).id;
  await ctx.prisma.company.update({ where: { id: site }, data: { parentCompanyId: principal } });
  const other = (await createCompany(ctx.prisma, { enseigne: "Autre groupe" })).id;
  for (const [sub, companyId, role] of [
    [PRINCIPAL_OWNER, principal, CustomerRole.owner],
    [PRINCIPAL_ADMIN, principal, CustomerRole.admin],
    [PRINCIPAL_ORDERS, principal, CustomerRole.orders],
    [SITE_OWNER, site, CustomerRole.owner],
    [STRANGER, other, CustomerRole.owner],
  ] as const) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    await attachTo(ctx.prisma, user.id, companyId, role);
  }
});

/** « Tout sauf la famille de X », masqué. */
async function closingFamilyOfX(): Promise<SubAccountMenuPayload> {
  const item = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { sku: X },
    select: { categoryId: true },
  });
  return {
    mode: "except",
    offMenu: "hidden",
    entries: [{ level: "family", ref: item.categoryId, effect: "exclude" }],
  };
}

const putAs = (sub: string, payload: SubAccountMenuPayload) =>
  ctx.asSub(sub).put(`/companies/${site}/menu`).send(payload);

async function shelfSkus(sub: string): Promise<string[]> {
  const view = jsonBody<ShopCatalogueView>(
    await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200),
  );
  return view.items.map((item) => item.sku);
}

describe("la carte d'un site, réglée depuis son principal", () => {
  it.each([PRINCIPAL_OWNER, PRINCIPAL_ADMIN])("%s l'écrit et la relit", async (sub) => {
    const payload = await closingFamilyOfX();
    await putAs(sub, payload).expect(204);

    const view = jsonBody<SubAccountMenuView>(
      await ctx.asSub(sub).get(`/companies/${site}/menu`).expect(200),
    );
    expect(view.menu).toMatchObject({ ...payload, updatedBy: "principal" });
  });

  it("🔴 le propriétaire du site lui-même est refusé en écriture ; il la lit (Hugo, 2026-11-20)", async () => {
    const refused = await putAs(SITE_OWNER, await closingFamilyOfX()).expect(403);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "account.sub_account_menu.principal_admin_required",
    );
    await ctx.asSub(SITE_OWNER).get(`/companies/${site}/menu`).expect(200);
    expect(await ctx.prisma.subAccountMenu.count({ where: { companyId: site } })).toBe(0);
  });

  it("un `orders` du principal est refusé : il n'ouvre pas le site", async () => {
    await putAs(PRINCIPAL_ORDERS, await closingFamilyOfX()).expect(404);
  });

  it("un principal étranger reçoit le refus d'une société inconnue", async () => {
    await putAs(STRANGER, await closingFamilyOfX()).expect(404);
    await ctx.asSub(STRANGER).get(`/companies/${site}/menu`).expect(404);
  });

  it("la carte écrite change le rayon du site, déjà lu une fois", async () => {
    expect(await shelfSkus(SITE_OWNER)).toContain(X);

    await putAs(PRINCIPAL_ADMIN, await closingFamilyOfX()).expect(204);
    expect(await shelfSkus(SITE_OWNER)).not.toContain(X);

    await putAs(PRINCIPAL_ADMIN, { mode: "except", offMenu: "hidden", entries: [] }).expect(204);
    expect(await shelfSkus(SITE_OWNER)).toContain(X);
  });
});

describe("la carte d'un site, sur sa fiche client", () => {
  const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

  it("le staff l'écrit, la relit, et le fait est au journal du site", async () => {
    const payload = await closingFamilyOfX();
    await staff()
      .put(`/admin/companies/${site}/menu`)
      .set(INTENT_KEY, freshIntent())
      .send(payload)
      .expect(204);

    const view = jsonBody<SubAccountMenuView>(
      await staff().get(`/admin/companies/${site}/menu`).expect(200),
    );
    expect(view.menu).toMatchObject({ ...payload, updatedBy: "staff" });
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: site, type: "company.sub_account_menu_set" },
      }),
    ).toBe(1);
  });

  it("rejouée à l'identique, n'écrit pas une seconde trace", async () => {
    const payload = await closingFamilyOfX();
    for (const intent of [freshIntent(), freshIntent()]) {
      await staff()
        .put(`/admin/companies/${site}/menu`)
        .set(INTENT_KEY, intent)
        .send(payload)
        .expect(204);
    }
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: site, type: "company.sub_account_menu_set" },
      }),
    ).toBe(1);
  });

  it("refuse un geste sans clé d'intention : il prévient le principal par e-mail", async () => {
    await staff()
      .put(`/admin/companies/${site}/menu`)
      .send(await closingFamilyOfX())
      .expect(400);
    expect(await ctx.prisma.subAccountMenu.count({ where: { companyId: site } })).toBe(0);
  });

  it("refuse une société sans principal", async () => {
    const alone = (await createCompany(ctx.prisma)).id;
    await staff()
      .put(`/admin/companies/${alone}/menu`)
      .set(INTENT_KEY, freshIntent())
      .send({ mode: "except", offMenu: "hidden", entries: [] })
      .expect(409);
  });
});
