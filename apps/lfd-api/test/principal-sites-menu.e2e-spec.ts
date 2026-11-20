/**
 * E2E : **la carte commune des sites** (`documentation/comptes-client/carte-des-sites.md`,
 * § 6, lots K1–K2).
 *
 * - elle s'applique aux sites du principal, jamais au principal lui-même ;
 * - une carte propre `except` sans entrée exempte un site ;
 * - la bascule « suivre la carte commune » / « reprendre la sienne », et son rejeu ;
 * - un membre du site lit la carte de son site, et n'écrit rien (Hugo, 2026-11-20) ;
 * - sous un principal suspendu, elle dort, et personne côté client ne la règle ;
 * - rattaché à un autre principal, un site laisse dormir sa carte propre ;
 * - le rayon du site, lu AVANT puis APRÈS une pose, change : la purge l'a effacé ;
 * - l'avis au principal quand l'équipe la pose, une fois par intention.
 *
 * Doublée : la signature des jetons (le jeton EST le `sub`), et l'envoi des e-mails.
 */
import type {
  AdminCompanyFicheView,
  PrincipalSitesMenuView,
  ShopCatalogueView,
  SubAccountMenuPayload,
  SubAccountMenuView,
} from "@lfd/contracts";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

/** L'article que la carte commune fermera, par sa famille. */
const X = "PAI-001-1";

const PRINCIPAL_OWNER = "auth0|common-principal-owner";
const PRINCIPAL_ADMIN = "auth0|common-principal-admin";
const PRINCIPAL_ORDERS = "auth0|common-principal-orders";
const SITE_OWNER = "auth0|common-site-owner";
const SITE_ORDERS = "auth0|common-site-orders";
const SIBLING_OWNER = "auth0|common-sibling-owner";
const STRANGER = "auth0|common-stranger";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: unknown;
}
const mails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    mails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;
let principal = "";
let site = "";
let sibling = "";
let other = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: MAILER, value: recordingMailer }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  mails.splice(0);
  principal = (await createCompany(ctx.prisma, { enseigne: "Club" })).id;
  site = (await createCompany(ctx.prisma, { enseigne: "Chalet du Club" })).id;
  sibling = (await createCompany(ctx.prisma, { enseigne: "Refuge du Club" })).id;
  other = (await createCompany(ctx.prisma, { enseigne: "Autre groupe" })).id;
  for (const id of [site, sibling]) {
    await ctx.prisma.company.update({ where: { id }, data: { parentCompanyId: principal } });
  }
  for (const [sub, companyId, role] of [
    [PRINCIPAL_OWNER, principal, CustomerRole.owner],
    [PRINCIPAL_ADMIN, principal, CustomerRole.admin],
    [PRINCIPAL_ORDERS, principal, CustomerRole.orders],
    [SITE_OWNER, site, CustomerRole.owner],
    [SITE_ORDERS, site, CustomerRole.orders],
    [SIBLING_OWNER, sibling, CustomerRole.owner],
    [STRANGER, other, CustomerRole.owner],
  ] as const) {
    const user = await createUser(ctx.prisma, {
      auth0Sub: sub,
      email: `${sub.slice(6)}@club.test`,
    });
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

const NO_RESTRICTION: SubAccountMenuPayload = { mode: "except", offMenu: "hidden", entries: [] };

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function shelfSkus(sub: string): Promise<string[]> {
  const view = jsonBody<ShopCatalogueView>(
    await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200),
  );
  return view.items.map((item) => item.sku);
}

const putCommon = (sub: string, payload: SubAccountMenuPayload) =>
  ctx.asSub(sub).put(`/companies/${principal}/sites-menu`).send(payload);

const siteMenu = async (sub: string, id: string = site): Promise<SubAccountMenuView> =>
  jsonBody<SubAccountMenuView>(await ctx.asSub(sub).get(`/companies/${id}/menu`).expect(200));

describe("la carte commune s'applique aux sites, pas au principal", () => {
  it("le rayon de chaque site change après la pose, celui du principal non", async () => {
    expect(await shelfSkus(SITE_OWNER)).toContain(X);
    expect(await shelfSkus(SIBLING_OWNER)).toContain(X);

    await putCommon(PRINCIPAL_OWNER, await closingFamilyOfX()).expect(204);

    expect(await shelfSkus(SITE_OWNER)).not.toContain(X);
    expect(await shelfSkus(SIBLING_OWNER)).not.toContain(X);
    expect(await shelfSkus(PRINCIPAL_OWNER)).toContain(X);
    const view = jsonBody<PrincipalSitesMenuView>(
      await ctx.asSub(PRINCIPAL_ADMIN).get(`/companies/${principal}/sites-menu`).expect(200),
    );
    expect(view.menu).toMatchObject({ mode: "except", updatedBy: "principal" });
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: principal, type: "company.principal_sites_menu_set" },
      }),
    ).toBe(1);
  });

  it("une carte propre `except` sans entrée exempte un site", async () => {
    await staff()
      .put(`/admin/companies/${site}/menu`)
      .set(INTENT_KEY, freshIntent())
      .send(NO_RESTRICTION)
      .expect(204);
    await putCommon(PRINCIPAL_OWNER, await closingFamilyOfX()).expect(204);

    expect(await shelfSkus(SITE_OWNER)).toContain(X);
    expect(await shelfSkus(SIBLING_OWNER)).not.toContain(X);
    expect((await siteMenu(SITE_OWNER)).state).toBe("own");
    expect((await siteMenu(SIBLING_OWNER, sibling)).state).toBe("common");
  });

  it("la fiche du principal dit, site par site, quelle carte compte", async () => {
    await putCommon(PRINCIPAL_OWNER, await closingFamilyOfX()).expect(204);
    await staff()
      .put(`/admin/companies/${site}/menu`)
      .set(INTENT_KEY, freshIntent())
      .send(NO_RESTRICTION)
      .expect(204);

    const fiche = jsonBody<AdminCompanyFicheView>(
      await staff().get(`/admin/companies/${principal}`).expect(200),
    );
    const byId = new Map(fiche.hierarchy.subAccounts.map((one) => [one.id, one]));
    expect(byId.get(site)).toMatchObject({
      menuState: "own",
      menu: { mode: "except", entryCount: 0 },
    });
    expect(byId.get(sibling)).toMatchObject({
      menuState: "common",
      menu: { mode: "except", entryCount: 1 },
    });
  });
});

describe("la bascule d'un site", () => {
  it("suit la carte commune, puis reprend la sienne ; rejouée, une seule trace", async () => {
    await staff()
      .put(`/admin/companies/${site}/menu`)
      .set(INTENT_KEY, freshIntent())
      .send(NO_RESTRICTION)
      .expect(204);
    await putCommon(PRINCIPAL_OWNER, await closingFamilyOfX()).expect(204);

    for (let i = 0; i < 2; i += 1) {
      await ctx
        .asSub(PRINCIPAL_ADMIN)
        .put(`/companies/${site}/menu/state`)
        .send({ state: "follows_common" })
        .expect(204);
    }
    expect(await shelfSkus(SITE_OWNER)).not.toContain(X);
    const followed = await siteMenu(PRINCIPAL_ADMIN);
    expect(followed.state).toBe("common");
    expect(followed.menu).toMatchObject({ mode: "except", entries: [] });
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: site, type: "company.sub_account_menu_state_set" },
      }),
    ).toBe(1);

    await staff()
      .put(`/admin/companies/${site}/menu/state`)
      .set(INTENT_KEY, freshIntent())
      .send({ state: "own" })
      .expect(204);
    expect(await shelfSkus(SITE_OWNER)).toContain(X);
  });

  it("reprendre une carte propre qu'un site n'a pas est refusé (409)", async () => {
    await staff()
      .put(`/admin/companies/${site}/menu/state`)
      .set(INTENT_KEY, freshIntent())
      .send({ state: "own" })
      .expect(409);
  });

  it("refuse la bascule du staff sans clé d'intention", async () => {
    await staff().put(`/admin/companies/${site}/menu/state`).send({ state: "own" }).expect(400);
  });
});

describe("le site lit, il ne règle pas (Hugo, 2026-11-20)", () => {
  it.each([SITE_OWNER, SITE_ORDERS])("%s lit la carte qui compte pour son site", async (sub) => {
    await putCommon(PRINCIPAL_OWNER, await closingFamilyOfX()).expect(204);
    const view = await siteMenu(sub);
    expect(view.state).toBe("common");
    expect(view.common).toMatchObject({ mode: "except", offMenu: "hidden" });
  });

  it.each([SITE_OWNER, SITE_ORDERS])("%s n'écrit ni sa carte, ni la bascule", async (sub) => {
    await ctx.asSub(sub).put(`/companies/${site}/menu`).send(NO_RESTRICTION).expect(403);
    await ctx
      .asSub(sub)
      .put(`/companies/${site}/menu/state`)
      .send({ state: "follows_common" })
      .expect(403);
    await putCommon(sub, NO_RESTRICTION).expect(404);
    expect(await ctx.prisma.subAccountMenu.count()).toBe(0);
  });

  it("le frère et le principal étranger ne lisent rien", async () => {
    await ctx.asSub(SIBLING_OWNER).get(`/companies/${site}/menu`).expect(404);
    await ctx.asSub(STRANGER).get(`/companies/${site}/menu`).expect(404);
    await ctx.asSub(STRANGER).get(`/companies/${principal}/sites-menu`).expect(404);
  });

  it("un `orders` du principal ne règle pas la carte commune", async () => {
    await putCommon(PRINCIPAL_ORDERS, NO_RESTRICTION).expect(403);
  });
});

describe("le principal suspendu", () => {
  it("la carte commune dort, et le client ne la règle plus", async () => {
    await putCommon(PRINCIPAL_OWNER, await closingFamilyOfX()).expect(204);
    await ctx.prisma.company.update({
      where: { id: principal },
      data: { status: CompanyStatus.suspended },
    });

    expect(await shelfSkus(SITE_OWNER)).toContain(X);
    await putCommon(PRINCIPAL_OWNER, NO_RESTRICTION).expect(403);
  });
});

describe("le rattachement à un autre principal", () => {
  it("la carte propre du site dort ; il suit la carte commune du nouveau", async () => {
    await staff()
      .put(`/admin/companies/${site}/menu`)
      .set(INTENT_KEY, freshIntent())
      .send({ mode: "only", offMenu: "hidden", entries: [] })
      .expect(204);
    expect(await shelfSkus(SITE_OWNER)).not.toContain(X);

    await staff().post(`/admin/companies/${site}/parent/detach`).expect(204);
    await staff().post(`/admin/companies/${site}/parent`).send({ parentId: other }).expect(204);

    const view = jsonBody<SubAccountMenuView>(
      await staff().get(`/admin/companies/${site}/menu`).expect(200),
    );
    expect(view.state).toBe("none");
    expect(view.menu).toMatchObject({ mode: "only" });
    expect(await shelfSkus(SITE_OWNER)).toContain(X);
  });
});

describe("la carte commune sur la fiche du principal", () => {
  it("le staff la pose et la relit ; un site ne porte pas de carte commune", async () => {
    const payload = await closingFamilyOfX();
    await staff()
      .put(`/admin/companies/${principal}/sites-menu`)
      .set(INTENT_KEY, freshIntent())
      .send(payload)
      .expect(204);
    const view = jsonBody<PrincipalSitesMenuView>(
      await staff().get(`/admin/companies/${principal}/sites-menu`).expect(200),
    );
    expect(view.menu).toMatchObject({ ...payload, updatedBy: "staff" });

    await staff()
      .put(`/admin/companies/${site}/sites-menu`)
      .set(INTENT_KEY, freshIntent())
      .send(payload)
      .expect(409);
    await staff().put(`/admin/companies/${principal}/sites-menu`).send(payload).expect(400);
  });

  it("prévient le principal une fois par intention, et pas quand il la pose lui-même", async () => {
    // L'avis ne va qu'aux rattachements ACCEPTÉS ; ces membres ne sont jamais entrés.
    await ctx.prisma.membership.updateMany({
      where: { companyId: principal },
      data: { acceptedAt: new Date(daysAgo(10)) },
    });
    const intent = freshIntent();
    for (let i = 0; i < 2; i += 1) {
      await staff()
        .put(`/admin/companies/${principal}/sites-menu`)
        .set(INTENT_KEY, intent)
        .send(await closingFamilyOfX())
        .expect(204);
      await ctx.drain();
    }
    const notices = mails.filter((mail) => mail.template === "customer.sub-account-gesture");
    expect(notices.map((mail) => mail.to).sort()).toEqual(
      ["common-principal-admin@club.test", "common-principal-owner@club.test"].sort(),
    );
    expect(notices[0]?.data).toEqual({
      gesture: "sites_menu_changed",
      siteName: "Club",
      reference: null,
      byTeam: true,
    });

    mails.splice(0);
    await putCommon(PRINCIPAL_OWNER, NO_RESTRICTION).expect(204);
    await ctx.drain();
    expect(mails.filter((mail) => mail.template === "customer.sub-account-gesture")).toEqual([]);
  });
});
