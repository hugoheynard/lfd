/**
 * E2E de l'**accès aux fonctionnalités** — plan
 * `documentation/auth-inscription/plan-inscription-pro-seule.md`, lot 1.
 *
 * Ce que seul le vrai SQL prouve :
 * - « revenir au défaut » SUPPRIME la ligne, et la trace reste au journal ;
 * - une ligne de production d'une clé retirée (2026-10-09) est signalée et
 *   jamais appliquée ;
 * - le mur staff : `commercial` lit, n'écrit pas ;
 * - la route publique ne dit rien des adresses exemptées ;
 * - une société s'exempte (non archivée, une fois), se liste nom figé et se
 *   retire, chaque geste au journal ; `/me` sert le planificateur au niveau
 *   GLOBAL, même pour un membre d'une société exemptée.
 *
 * Une frontière doublée : la signature du jeton staff. Le reste est réel.
 */
import type { AccountView, AdminFeatureAccessView, FeatureLevelsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { CustomerRole } from "../src/platform/database/client/client.js";

const COMMERCIAL_SUB = "staff-commercial";
const TESTER_EMAIL = "testeur@exemple.fr";
const KEY = "customerMandate";
const CLIENT = "auth0|client";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Léa",
      lastName: "Commerciale",
      email: "commercial@lfc.test",
      role: "commercial",
      status: "active",
      auth0Id: COMMERCIAL_SUB,
    },
  });
});

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function board(): Promise<AdminFeatureAccessView> {
  return jsonBody<AdminFeatureAccessView>(await admin().get("/admin/feature-access").expect(200));
}

/**
 * Les défauts du catalogue (vérifié le 2026-11-27) : `shop`, `orders`,
 * `invoices`, `desktopMenu` et `publicDelivery` en sont retirées.
 */
const DEFAULTS = {
  customerMandate: "closed",
  facebookLogin: "hidden",
  proSignupCallback: "hidden",
  orderPlanner: "closed",
} as const;

async function publicLevels(): Promise<FeatureLevelsView> {
  return jsonBody<FeatureLevelsView>(await ctx.http().get("/feature-access").expect(200));
}

describe("la dérogation — posée, puis retirée", () => {
  it("affiche le défaut du code sur une base vide", async () => {
    const view = await board();

    // 2026-09-14 : fermé par défaut, et aucune exemption ne l'ouvre.
    expect(view.features).toEqual([
      expect.objectContaining({
        key: KEY,
        effectiveLevel: "closed",
        exemptBy: null,
        override: null,
      }),
      expect.objectContaining({
        key: "facebookLogin",
        effectiveLevel: "hidden",
        exemptBy: null,
        override: null,
      }),
      expect.objectContaining({
        key: "proSignupCallback",
        effectiveLevel: "hidden",
        exemptBy: null,
        override: null,
      }),
      expect.objectContaining({
        key: "orderPlanner",
        effectiveLevel: "closed",
        exemptBy: "company",
        override: null,
      }),
    ]);
    expect(view.ignored).toEqual([]);
    await expect(publicLevels()).resolves.toEqual(DEFAULTS);
  });

  it("pose la valeur avec son auteur, puis la ligne DISPARAÎT au retour au défaut", async () => {
    await admin().put(`/admin/feature-access/${KEY}`).send({ value: "open" }).expect(204);

    const posed = await board();
    expect(posed.features[0]).toMatchObject({
      effectiveLevel: "open",
      override: { value: "open" },
    });
    // Un nom et un rôle, plus d'identifiant : le champ `sub` n'est plus servi
    // (plan de l'auteur, étape 5A).
    expect(posed.features[0]?.override?.updatedBy).toEqual({
      name: "Opérateur E2E",
      role: "admin",
    });
    // L'auteur est l'id de fiche (plan de l'auteur, étape 3).
    await expect(
      ctx.prisma.featureAccessOverride.findUniqueOrThrow({
        where: { key: KEY },
        select: { updatedByStaffId: true },
      }),
    ).resolves.toEqual({ updatedByStaffId: E2E_STAFF_ID });
    await expect(publicLevels()).resolves.toEqual({ ...DEFAULTS, customerMandate: "open" });

    await admin().delete(`/admin/feature-access/${KEY}`).expect(204);

    expect(await ctx.prisma.featureAccessOverride.count()).toBe(0);
    await expect(publicLevels()).resolves.toEqual(DEFAULTS);
    const types = await ctx.prisma.activityEvent.findMany({
      where: { subjectType: "feature_access", subjectId: KEY },
      select: { type: true },
    });
    expect(types.map((row) => row.type).sort()).toEqual([
      "feature_access.override_cleared",
      "feature_access.override_set",
    ]);
  });

  it("refuse en 404 un second retour au défaut", async () => {
    await admin().delete(`/admin/feature-access/${KEY}`).expect(404);
  });

  it("refuse en 400 une valeur hors catalogue, et en 404 une clé inconnue ou retirée", async () => {
    await admin().put(`/admin/feature-access/${KEY}`).send({ value: "order" }).expect(400);
    await admin().put("/admin/feature-access/legacy_flag").send({ value: "order" }).expect(404);
    await admin().put("/admin/feature-access/shop").send({ value: "closed" }).expect(404);

    expect(await ctx.prisma.featureAccessOverride.count()).toBe(0);
  });

  /**
   * Les clés retirées le 2026-10-09 ont pu laisser des lignes en production :
   * elles ne sont pas effacées. Écrites ici en direct, parce que le domaine ne
   * PEUT plus les produire — c'est précisément le cas éprouvé.
   */
  it("signale les lignes des clés retirées, sans les appliquer", async () => {
    const removed = ["shop", "orders", "invoices", "desktopMenu", "publicDelivery"];
    for (const key of removed) {
      await ctx.prisma.featureAccessOverride.create({
        data: {
          key,
          value: "closed",
          updatedAt: new Date(),
          updatedByStaffId: E2E_STAFF_ID,
          updatedByName: "",
          updatedByRole: "",
        },
      });
    }
    await ctx.prisma.featureAccessExemption.create({
      data: {
        id: "ex_retiree",
        key: "shop",
        email: TESTER_EMAIL,
        createdAt: new Date(),
        createdByStaffId: E2E_STAFF_ID,
        createdByName: "",
        createdByRole: "",
      },
    });

    const view = await board();

    expect(view.features.map((feature) => feature.key)).toEqual([
      KEY,
      "facebookLogin",
      "proSignupCallback",
      "orderPlanner",
    ]);
    expect(view.ignored).toEqual(
      expect.arrayContaining([
        ...removed.map((key) => ({
          table: "override",
          key,
          id: null,
          detail: "closed",
          reason: "unknown_key",
        })),
        {
          table: "exemption",
          key: "shop",
          id: "ex_retiree",
          detail: TESTER_EMAIL,
          reason: "unknown_key",
        },
      ]),
    );
    expect(view.ignored).toHaveLength(removed.length + 1);
    await expect(publicLevels()).resolves.toEqual(DEFAULTS);
  });
});

describe("la liste d'exemption", () => {
  /** Plan mandat client §8 : aucune adresse n'ouvre le mandat. */
  it("refuse en 409 d'exempter sur le mandat client, et en 404 sur une clé retirée", async () => {
    await admin()
      .post(`/admin/feature-access/${KEY}/exemptions`)
      .send({ email: TESTER_EMAIL })
      .expect(409);
    await admin()
      .post("/admin/feature-access/shop/exemptions")
      .send({ email: TESTER_EMAIL })
      .expect(404);

    expect(await ctx.prisma.featureAccessExemption.count()).toBe(0);
  });
});

describe("les sociétés exemptées", () => {
  const PLANNER = "orderPlanner";

  it("ajoute une société active, la liste nom figé, puis la retire — chaque geste au journal", async () => {
    const company = await createCompany(ctx.prisma, { enseigne: "Chalet Alpin" });

    await admin()
      .post(`/admin/feature-access/${PLANNER}/company-exemptions`)
      .send({ companyId: company.id })
      .expect(204);
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { enseigne: "Chalet renommé" },
    });

    const listed = (await board()).features.find((feature) => feature.key === PLANNER);
    expect(listed?.companyExemptions).toEqual([
      expect.objectContaining({ companyId: company.id, companyName: "Chalet Alpin" }),
    ]);

    await admin()
      .delete(`/admin/feature-access/${PLANNER}/company-exemptions/${company.id}`)
      .expect(204);
    expect(await ctx.prisma.featureAccessCompanyExemption.count()).toBe(0);
    await admin()
      .delete(`/admin/feature-access/${PLANNER}/company-exemptions/${company.id}`)
      .expect(404);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "feature_access.company_exemption" } },
      orderBy: { occurredAt: "asc" },
      select: { type: true, payload: true },
    });
    const named = { company: { id: company.id, name: "Chalet Alpin" } };
    expect(facts.map((fact) => fact.type)).toEqual([
      "feature_access.company_exemption_added",
      "feature_access.company_exemption_removed",
    ]);
    for (const fact of facts) {
      expect(fact.payload).toMatchObject(named);
    }
  });

  it("refuse une société déjà exemptée (409), inconnue (404), archivée (409), et une clé qui ne s'exempte pas par société (409)", async () => {
    const company = await createCompany(ctx.prisma);
    const archived = await createCompany(ctx.prisma);
    await ctx.prisma.company.update({
      where: { id: archived.id },
      data: { archivedAt: new Date(), archiveReason: "compte fermé" },
    });
    const add = (key: string, companyId: string) =>
      admin().post(`/admin/feature-access/${key}/company-exemptions`).send({ companyId });

    await add(PLANNER, company.id).expect(204);
    await add(PLANNER, company.id).expect(409);
    await add(PLANNER, "societe-inconnue").expect(404);
    await add(PLANNER, archived.id).expect(409);
    await add(KEY, company.id).expect(409);

    expect(await ctx.prisma.featureAccessCompanyExemption.count()).toBe(1);
  });

  it("propose au sélecteur les seules sociétés non archivées, triées par nom", async () => {
    const zeta = await createCompany(ctx.prisma, { enseigne: "Zeta" });
    const alpha = await createCompany(ctx.prisma, { enseigne: "Alpha" });
    const archived = await createCompany(ctx.prisma, { enseigne: "Archivée" });
    await ctx.prisma.company.update({
      where: { id: archived.id },
      data: { archivedAt: new Date(), archiveReason: "compte fermé" },
    });

    const response = await admin().get("/admin/feature-access/exemptible-companies").expect(200);

    expect(jsonBody<unknown>(response)).toEqual([
      { id: alpha.id, name: "Alpha" },
      { id: zeta.id, name: "Zeta" },
    ]);
  });

  /** Le planificateur ne s'exempte plus par adresse : ses lignes sont signalées. */
  it("refuse d'exempter une adresse sur le planificateur (409)", async () => {
    await admin()
      .post(`/admin/feature-access/${PLANNER}/exemptions`)
      .send({ email: TESTER_EMAIL })
      .expect(409);
  });

  /** `/me` est lu sans espace : il ne peut rien dire d'une société exemptée. */
  it("/me sert le planificateur au niveau GLOBAL, même au membre d'une société exemptée", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    const company = await createCompany(ctx.prisma);
    await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
    await admin()
      .post(`/admin/feature-access/${PLANNER}/company-exemptions`)
      .send({ companyId: company.id })
      .expect(204);

    const me = await ctx.asSub(CLIENT).get("/me").expect(200);

    expect(jsonBody<AccountView>(me).featureLevels.orderPlanner).toBe("closed");
  });
});

describe("le mur staff", () => {
  it("laisse le commercial LIRE, et lui refuse chaque écriture", async () => {
    const commercial = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(COMMERCIAL_SUB);

    await commercial().get("/admin/feature-access").expect(200);
    await commercial().put(`/admin/feature-access/${KEY}`).send({ value: "open" }).expect(403);
    await commercial().delete(`/admin/feature-access/${KEY}`).expect(403);
    await commercial()
      .post(`/admin/feature-access/${KEY}/exemptions`)
      .send({ email: TESTER_EMAIL })
      .expect(403);
    await commercial().delete(`/admin/feature-access/${KEY}/exemptions/inexistant`).expect(403);
    await commercial()
      .post("/admin/feature-access/orderPlanner/company-exemptions")
      .send({ companyId: "societe" })
      .expect(403);
    await commercial()
      .delete("/admin/feature-access/orderPlanner/company-exemptions/societe")
      .expect(403);

    expect(await ctx.prisma.featureAccessOverride.count()).toBe(0);
    expect(await ctx.prisma.featureAccessExemption.count()).toBe(0);
  });
});

describe("GET /feature-access — public", () => {
  it("répond sans jeton", async () => {
    const response = await ctx.http().get("/feature-access").expect(200);

    expect(jsonBody<FeatureLevelsView>(response)).toEqual(DEFAULTS);
    expect(response.text).not.toContain("@");
  });
});

/**
 * Les niveaux d'une personne connectée voyagent dans `GET /me` depuis le
 * 2026-11-05 : `GET /feature-access/mine` coûtait une requête entière de plus
 * à chaque ouverture de la boutique, et a été retirée.
 */
describe("GET /me — les niveaux de la personne", () => {
  it("rend les niveaux de la personne, de la même forme que la route publique", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });

    const response = await ctx.asSub(CLIENT).get("/me").expect(200);

    expect(jsonBody<AccountView>(response).featureLevels).toEqual(DEFAULTS);
  });

  it("la route retirée ne répond plus", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });

    await ctx.asSub(CLIENT).get("/feature-access/mine").expect(404);
  });

  /** 2026-10-09 : le bouton Facebook se montre par l'admin, pour tous à la fois. */
  it("sert la connexion par Facebook posée visible, sur les deux routes", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    await admin().put("/admin/feature-access/facebookLogin").send({ value: "visible" }).expect(204);

    const expected = { ...DEFAULTS, facebookLogin: "visible" };
    await expect(publicLevels()).resolves.toEqual(expected);
    const me = await ctx.asSub(CLIENT).get("/me").expect(200);
    expect(jsonBody<AccountView>(me).featureLevels).toEqual(expected);
  });
});
