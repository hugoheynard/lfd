/**
 * E2E de l'**accès aux fonctionnalités** — plan
 * `documentation/auth-inscription/plan-inscription-pro-seule.md`, lot 1.
 *
 * Ce que seul le vrai SQL prouve :
 * - « revenir au défaut » SUPPRIME la ligne, et la trace reste au journal ;
 * - une ligne de production d'une clé retirée (2026-10-09) est signalée et
 *   jamais appliquée ;
 * - le mur staff : `commercial` lit, n'écrit pas ;
 * - la route publique ne dit rien des adresses exemptées.
 *
 * Une frontière doublée : la signature du jeton staff. Le reste est réel.
 */
import type { AdminFeatureAccessView, FeatureLevelsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

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
 * Le catalogue ne porte plus que le mandat client et la connexion par Facebook
 * depuis le 2026-10-09 : `shop`, `orders`, `invoices`, `desktopMenu` et
 * `publicDelivery` sont retirées.
 */
const DEFAULTS = { customerMandate: "closed", facebookLogin: "hidden" } as const;

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
        exemptible: false,
        override: null,
      }),
      expect.objectContaining({
        key: "facebookLogin",
        effectiveLevel: "hidden",
        exemptible: false,
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

    expect(view.features.map((feature) => feature.key)).toEqual([KEY, "facebookLogin"]);
    expect(view.ignored).toEqual(
      expect.arrayContaining([
        ...removed.map((key) => ({
          table: "override",
          key,
          detail: "closed",
          reason: "unknown_key",
        })),
        { table: "exemption", key: "shop", detail: TESTER_EMAIL, reason: "unknown_key" },
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

/** Repris de la suite des gardes de la boutique, retirée avec la clé `shop` le 2026-10-09. */
describe("GET /feature-access/mine", () => {
  it("rend les niveaux de la personne, de la même forme que la route publique", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });

    const response = await ctx.asSub(CLIENT).get("/feature-access/mine").expect(200);

    expect(jsonBody<FeatureLevelsView>(response)).toEqual(DEFAULTS);
  });

  it("exige une personne connectée", async () => {
    await ctx.http().get("/feature-access/mine").expect(401);
  });

  /** 2026-10-09 : le bouton Facebook se montre par l'admin, pour tous à la fois. */
  it("sert la connexion par Facebook posée visible, sur les deux routes", async () => {
    await createUser(ctx.prisma, { auth0Sub: CLIENT, emailVerified: true });
    await admin().put("/admin/feature-access/facebookLogin").send({ value: "visible" }).expect(204);

    const expected = { ...DEFAULTS, facebookLogin: "visible" };
    await expect(publicLevels()).resolves.toEqual(expected);
    const mine = await ctx.asSub(CLIENT).get("/feature-access/mine").expect(200);
    expect(jsonBody<FeatureLevelsView>(mine)).toEqual(expected);
  });
});
