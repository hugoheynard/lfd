/**
 * E2E du **planificateur de commandes des pros**
 * (`documentation/commandes/planificateur/plan-planificateur-de-commandes.md`, L1).
 *
 * Ce que seul le vrai Postgres prouve :
 * - le mur : une société ne lit, n'écrit ni ne retire la colonne d'une autre ;
 *   un particulier est refusé (403) ;
 * - une colonne par jour ET par créneau, tenue par l'unicité partielle ;
 * - la version : un second onglet ne s'écrase pas, un rejeu ne monte rien ;
 * - le retrait garde la ligne en base et libère le créneau ;
 * - les favoris de la société (ceux de la boutique, par espace) en colonne de gauche ;
 * - la vérification de la passation servie avec la grille (§ 4 bis) ;
 * - la clé `orderPlanner` : fermée, chaque route refuse (409) après le mur ;
 *   une SOCIÉTÉ exemptée l'ouvre pour qui agit dans son espace, sans
 *   héritage vers ses sites ; `GET /planner/access` dit la même chose sans
 *   refus ; ouverte, tous passent. Les autres cas l'ouvrent dans leur
 *   préparation.
 */
import {
  WORKSPACE_HEADER,
  type PlannedColumnOpened,
  type PlannedColumnWritten,
  type PlannedRoutingPayload,
  type PlannerAccessView,
  type PlannerView,
} from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { exemptCompanyFromFeature, openFeature } from "./feature-access-scene.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const PRO_A = "auth0|planner-pro-a";
const PRO_B = "auth0|planner-pro-b";
const PERSON = "auth0|planner-particulier";

const MORNING: PlannedRoutingPayload = {
  method: "pickup",
  deliveryAddress: null,
  pickupAddressId: null,
  window: { start: "07:00", end: "09:00" },
};
const NOON: PlannedRoutingPayload = { ...MORNING, window: { start: "11:00", end: "12:00" } };

let ctx: E2eContext;
const companyOf = new Map<string, string>();

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  companyOf.clear();
  for (const sub of [PRO_A, PRO_B]) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
    companyOf.set(sub, company.id);
  }
  await createUser(ctx.prisma, { auth0Sub: PERSON });
  await openFeature(ctx, "orderPlanner");
});

/** Une requête dans l'espace de la société de `sub` (aucun en-tête pour le particulier). */
function as(sub: string) {
  const agent = ctx.asSub(sub);
  const company = companyOf.get(sub);
  const scoped = <T extends { set(name: string, value: string): T }>(request: T): T =>
    company === undefined ? request : request.set(WORKSPACE_HEADER, company);
  return {
    get: (url: string) => scoped(agent.get(url)),
    post: (url: string) => scoped(agent.post(url)).set(INTENT_KEY, freshIntent()),
    put: (url: string) => scoped(agent.put(url)),
    delete: (url: string) => scoped(agent.delete(url)),
  };
}

async function openColumn(
  sub: string,
  day: string,
  routing = MORNING,
): Promise<PlannedColumnOpened> {
  const response = await as(sub).post("/planner/columns").send({ day, routing }).expect(200);
  return jsonBody<PlannedColumnOpened>(response);
}

async function plannerOf(sub: string, from: string): Promise<PlannerView> {
  const response = await as(sub).get(`/planner?from=${from}`).expect(200);
  return jsonBody<PlannerView>(response);
}

const lines = (quantity: number) => [{ sku: "SKU-INCONNU", quantity }];

describe("planner — le mur", () => {
  it("refuse le particulier sur chaque route (403)", async () => {
    const day = serviceDay(2);
    await as(PERSON).get(`/planner?from=${day}`).expect(403);
    await as(PERSON).post("/planner/columns").send({ day, routing: MORNING }).expect(403);
  });

  it("une société ne lit, n'écrit ni ne retire la colonne d'une autre", async () => {
    const day = serviceDay(2);
    const { id } = await openColumn(PRO_A, day);

    const seenByB = await plannerOf(PRO_B, day);
    expect(seenByB.days).toEqual([]);
    await as(PRO_B)
      .put(`/planner/columns/${id}`)
      .send({ version: 1, routing: MORNING, lines: lines(3) })
      .expect(404);
    await as(PRO_B).delete(`/planner/columns/${id}`).expect(404);

    const seenByA = await plannerOf(PRO_A, day);
    expect(seenByA.days[0]?.columns.map((column) => column.id)).toEqual([id]);
  });
});

describe("planner — les colonnes", () => {
  it("un jour porte une colonne par créneau ; rouvrir le même créneau rend la même", async () => {
    const day = serviceDay(3);
    const morning = await openColumn(PRO_A, day, MORNING);
    const noon = await openColumn(PRO_A, day, NOON);
    const again = await openColumn(PRO_A, day, MORNING);

    expect(noon.id).not.toBe(morning.id);
    expect(again).toEqual(morning);
    const view = await plannerOf(PRO_A, day);
    expect(view.days).toHaveLength(1);
    expect(view.days[0]?.columns.map((column) => column.id)).toEqual([morning.id, noon.id]);
  });

  it("deux créneaux « avant 9 h » ne se doublent pas (début nul)", async () => {
    const day = serviceDay(3);
    const before9 = { ...MORNING, window: { start: null, end: "09:00" } };
    const first = await openColumn(PRO_A, day, before9);
    const second = await openColumn(PRO_A, day, before9);
    expect(second.id).toBe(first.id);
    expect(await ctx.prisma.plannedColumn.count()).toBe(1);
  });

  it("écrit la colonne, ne monte rien au rejeu, refuse un onglet périmé (409)", async () => {
    const day = serviceDay(3);
    const { id } = await openColumn(PRO_A, day);
    const put = (version: number, quantity: number) =>
      as(PRO_A)
        .put(`/planner/columns/${id}`)
        .send({ version, routing: MORNING, lines: lines(quantity) });

    const written = jsonBody<PlannedColumnWritten>(await put(1, 40).expect(200));
    expect(written.version).toBe(2);
    expect(jsonBody<PlannedColumnWritten>(await put(1, 40).expect(200)).version).toBe(2);
    await put(1, 12).expect(409);

    const view = await plannerOf(PRO_A, day);
    expect(view.days[0]?.columns[0]?.lines).toEqual(lines(40));
  });

  it("refuse de déplacer une colonne sur le créneau d'une autre (409)", async () => {
    const day = serviceDay(3);
    await openColumn(PRO_A, day, MORNING);
    const noon = await openColumn(PRO_A, day, NOON);
    await as(PRO_A)
      .put(`/planner/columns/${noon.id}`)
      .send({ version: 1, routing: MORNING, lines: [] })
      .expect(409);
  });

  it("retire une colonne : elle reste en base, sort de l'écran, et libère son créneau", async () => {
    const day = serviceDay(3);
    const { id } = await openColumn(PRO_A, day);
    await as(PRO_A).delete(`/planner/columns/${id}`).expect(204);
    await as(PRO_A).delete(`/planner/columns/${id}`).expect(204);

    expect((await plannerOf(PRO_A, day)).days).toEqual([]);
    const reopened = await openColumn(PRO_A, day);
    expect(reopened.id).not.toBe(id);
    expect(await ctx.prisma.plannedColumn.count()).toBe(2);
    await as(PRO_A)
      .put(`/planner/columns/${id}`)
      .send({ version: 2, routing: MORNING, lines: [] })
      .expect(404);
  });

  it("refuse un jour passé et un jour au-delà des 28 jours (409)", async () => {
    await as(PRO_A)
      .post("/planner/columns")
      .send({ day: serviceDay(-1), routing: MORNING })
      .expect(409);
    await as(PRO_A)
      .post("/planner/columns")
      .send({ day: serviceDay(29), routing: MORNING })
      .expect(409);
    await openColumn(PRO_A, serviceDay(28));
  });
});

describe("planner — les favoris et la vérification", () => {
  it("la colonne de gauche est les favoris de l'espace de la société, et d'elle seule", async () => {
    await as(PRO_A).put("/me/favorites/SKU-A").expect(204);
    await as(PRO_B).put("/me/favorites/SKU-B").expect(204);

    const day = serviceDay(2);
    expect((await plannerOf(PRO_A, day)).favorites).toEqual(["SKU-A"]);
    expect((await plannerOf(PRO_B, day)).favorites).toEqual(["SKU-B"]);

    await as(PRO_A).delete("/me/favorites/SKU-A").expect(204);
    expect((await plannerOf(PRO_A, day)).favorites).toEqual([]);
  });

  it("n'a plus de route de liste d'envies (404)", async () => {
    await as(PRO_A).put("/planner/wishlist/SKU-A").expect(404);
  });

  it("sert ce que dirait la passation : par colonne pour les lignes, par jour pour les favoris", async () => {
    const day = serviceDay(3);
    const { id } = await openColumn(PRO_A, day);
    await as(PRO_A)
      .put(`/planner/columns/${id}`)
      .send({ version: 1, routing: MORNING, lines: lines(2) })
      .expect(200);
    await as(PRO_A).put("/me/favorites/SKU-ENVIE").expect(204);

    const view = await plannerOf(PRO_A, day);
    expect(view.shownDays).toEqual([day]);
    expect(view.checks.map((check) => [check.sku, check.day, check.columnId])).toEqual([
      ["SKU-INCONNU", day, id],
      ["SKU-ENVIE", day, null],
    ]);
    // Des articles que le catalogue ne connaît pas : la passation les refuserait.
    for (const check of view.checks) {
      expect(check.blocking?.cause).toBe("order_refused");
      expect(check.quantityIndependent).toBe(true);
    }
  });
});

describe("planner — la clé orderPlanner", () => {
  const SITE_MEMBER = "auth0|planner-membre-du-site";

  const closePlanner = () =>
    ctx.asSub(E2E_STAFF_SUB).delete("/admin/feature-access/orderPlanner").expect(204);

  async function accessOf(sub: string): Promise<boolean> {
    const response = await as(sub).get("/planner/access").expect(200);
    return jsonBody<PlannerAccessView>(response).open;
  }

  /** Un site de la société de PRO_A, et un membre rattaché au SITE seulement. */
  async function seedSiteOfProA(): Promise<string> {
    const site = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: companyOf.get(PRO_A) ?? "" },
    });
    const member = await createUser(ctx.prisma, { auth0Sub: SITE_MEMBER });
    await attachTo(ctx.prisma, member.id, site.id, CustomerRole.owner);
    companyOf.set(SITE_MEMBER, site.id);
    return site.id;
  }

  it("fermée, refuse chaque route (409) sans rien écrire", async () => {
    const day = serviceDay(2);
    const { id } = await openColumn(PRO_A, day);
    await closePlanner();

    const refused = await as(PRO_A).get(`/planner?from=${day}`).expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("planner.closed");
    await as(PRO_A).post("/planner/columns").send({ day, routing: NOON }).expect(409);
    await as(PRO_A)
      .put(`/planner/columns/${id}`)
      .send({ version: 1, routing: MORNING, lines: lines(3) })
      .expect(409);
    await as(PRO_A).delete(`/planner/columns/${id}`).expect(409);
    await expect(accessOf(PRO_A)).resolves.toBe(false);

    const stored = await ctx.prisma.plannedColumn.findMany({ select: { id: true, version: true } });
    expect(stored).toEqual([{ id, version: 1 }]);
  });

  it("le particulier : refusé par le mur (403) sur les routes, `false` sur l'accès", async () => {
    await closePlanner();
    await as(PERSON)
      .get(`/planner?from=${serviceDay(2)}`)
      .expect(403);
    await expect(accessOf(PERSON)).resolves.toBe(false);
  });

  it("fermée, s'ouvre pour la société exemptée — et elle seule", async () => {
    await closePlanner();
    await exemptCompanyFromFeature(ctx, "orderPlanner", companyOf.get(PRO_A) ?? "");
    const day = serviceDay(2);

    await openColumn(PRO_A, day);
    const view = await plannerOf(PRO_A, day);
    expect(view.days).toHaveLength(1);
    await expect(accessOf(PRO_A)).resolves.toBe(true);

    const refused = await as(PRO_B).get(`/planner?from=${day}`).expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("planner.closed");
    await expect(accessOf(PRO_B)).resolves.toBe(false);
  });

  /** Égalité exacte : exempter un principal n'ouvre pas ses sites. */
  it("fermée, le membre d'un SITE du principal exempté reste refusé (409)", async () => {
    await closePlanner();
    await seedSiteOfProA();
    await exemptCompanyFromFeature(ctx, "orderPlanner", companyOf.get(PRO_A) ?? "");

    const refused = await as(SITE_MEMBER)
      .get(`/planner?from=${serviceDay(2)}`)
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("planner.closed");
    await expect(accessOf(SITE_MEMBER)).resolves.toBe(false);
  });

  it("ouverte pour tous, l'accès le dit dans chaque espace société", async () => {
    await expect(accessOf(PRO_A)).resolves.toBe(true);
    await expect(accessOf(PRO_B)).resolves.toBe(true);
  });
});
