/**
 * E2E de l'**accès aux fonctionnalités** — plan
 * `documentation/auth-inscription/plan-inscription-pro-seule.md`, lot 1.
 *
 * Ce que seul le vrai SQL prouve :
 * - « revenir au défaut » SUPPRIME la ligne, et la trace reste au journal ;
 * - l'unicité `(clé, adresse)` rend l'ajout d'exemption idempotent ;
 * - l'état du compte (`verified` / `unverified` / `none`) est lu dans la vraie
 *   table des personnes ;
 * - le mur staff : `commercial` lit, n'écrit pas ;
 * - la route publique ne dit rien des adresses exemptées.
 *
 * Une frontière doublée : la signature du jeton staff. Le reste est réel.
 */
import type { AdminFeatureAccessView, CreatedIdResponse, FeatureLevelsView } from "@lfd/contracts";

import { FeatureLevelResolver } from "../src/b2b/feature-access/application/feature-level.resolver.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { legacyAuthorOf } from "./legacy-author-columns.js";

const COMMERCIAL_SUB = "staff-commercial";
const TESTER_EMAIL = "testeur@exemple.fr";

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

/** Toutes les clés sauf la boutique, à leur défaut : le mandat client est fermé (2026-09-14). */
const OTHER_DEFAULTS = {
  orders: "visible",
  invoices: "visible",
  desktopMenu: "visible",
  customerMandate: "closed",
} as const;

async function publicLevels(): Promise<FeatureLevelsView> {
  return jsonBody<FeatureLevelsView>(await ctx.http().get("/feature-access").expect(200));
}

describe("la dérogation — posée, puis retirée", () => {
  it("affiche le défaut du code sur une base vide", async () => {
    const view = await board();

    expect(view.features).toEqual([
      expect.objectContaining({ key: "shop", effectiveLevel: "order", override: null }),
      expect.objectContaining({ key: "orders", effectiveLevel: "visible", override: null }),
      expect.objectContaining({ key: "invoices", effectiveLevel: "visible", override: null }),
      expect.objectContaining({ key: "desktopMenu", effectiveLevel: "visible", override: null }),
      // 2026-09-14 : fermé par défaut, et aucune exemption ne l'ouvre.
      expect.objectContaining({
        key: "customerMandate",
        effectiveLevel: "closed",
        exemptible: false,
        override: null,
      }),
    ]);
    await expect(publicLevels()).resolves.toEqual({ shop: "order", ...OTHER_DEFAULTS });
  });

  it("pose la valeur avec son auteur, puis la ligne DISPARAÎT au retour au défaut", async () => {
    await admin().put("/admin/feature-access/shop").send({ value: "browse" }).expect(204);

    const posed = await board();
    expect(posed.features[0]).toMatchObject({
      effectiveLevel: "browse",
      override: { value: "browse" },
    });
    // Un nom et un rôle, plus d'identifiant : le champ `sub` n'est plus servi
    // (plan de l'auteur, étape 5A).
    expect(posed.features[0]?.override?.updatedBy).toEqual({
      name: "Opérateur E2E",
      role: "admin",
    });
    // L'id de fiche dans la nouvelle colonne seule ; l'ancienne, que Prisma ne
    // connaît plus, n'est plus écrite (plan de l'auteur, étape 5B).
    await expect(
      ctx.prisma.featureAccessOverride.findUniqueOrThrow({
        where: { key: "shop" },
        select: { updatedByStaffId: true },
      }),
    ).resolves.toEqual({ updatedByStaffId: E2E_STAFF_ID });
    expect(
      await legacyAuthorOf(ctx.prisma, "feature_access_overrides.updated_by_sub", "shop"),
    ).toBeNull();
    await expect(publicLevels()).resolves.toEqual({ shop: "browse", ...OTHER_DEFAULTS });

    await admin().delete("/admin/feature-access/shop").expect(204);

    expect(await ctx.prisma.featureAccessOverride.count()).toBe(0);
    await expect(publicLevels()).resolves.toEqual({ shop: "order", ...OTHER_DEFAULTS });
    const types = await ctx.prisma.activityEvent.findMany({
      where: { subjectType: "feature_access", subjectId: "shop" },
      select: { type: true },
    });
    expect(types.map((row) => row.type).sort()).toEqual([
      "feature_access.override_cleared",
      "feature_access.override_set",
    ]);
  });

  it("refuse en 404 un second retour au défaut", async () => {
    await admin().delete("/admin/feature-access/shop").expect(404);
  });

  it("refuse en 400 une valeur hors catalogue, et en 404 une clé inconnue", async () => {
    await admin().put("/admin/feature-access/shop").send({ value: "open" }).expect(400);
    await admin().put("/admin/feature-access/legacy_flag").send({ value: "order" }).expect(404);

    expect(await ctx.prisma.featureAccessOverride.count()).toBe(0);
  });

  it("signale une ligne dont la clé a quitté le catalogue, sans l'appliquer", async () => {
    // Écrite en direct : le domaine ne PEUT pas produire cette ligne, et c'est
    // précisément le cas éprouvé — une clé retirée du code après avoir été posée.
    await ctx.prisma.featureAccessOverride.create({
      data: {
        key: "legacy_flag",
        value: "on",
        updatedAt: new Date(),
        updatedByStaffId: E2E_STAFF_ID,
        updatedByName: "",
        updatedByRole: "",
      },
    });

    const view = await board();

    expect(view.ignored).toEqual([
      { table: "override", key: "legacy_flag", detail: "on", reason: "unknown_key" },
    ]);
    await expect(publicLevels()).resolves.toEqual({ shop: "order", ...OTHER_DEFAULTS });
  });
});

describe("la liste d'exemption", () => {
  it("ajoute une adresse normalisée, idempotent, puis la retire", async () => {
    const first = jsonBody<CreatedIdResponse>(
      await admin()
        .post("/admin/feature-access/shop/exemptions")
        .send({ email: "  Testeur@Exemple.FR " })
        .expect(201),
    );
    const second = jsonBody<CreatedIdResponse>(
      await admin()
        .post("/admin/feature-access/shop/exemptions")
        .send({ email: TESTER_EMAIL })
        .expect(201),
    );

    expect(second.id).toBe(first.id);
    expect((await board()).features[0]?.exemptions).toEqual([
      expect.objectContaining({ id: first.id, email: TESTER_EMAIL, accountState: "none" }),
    ]);
    // L'id de fiche dans la nouvelle colonne seule (plan de l'auteur, étape 5B).
    await expect(
      ctx.prisma.featureAccessExemption.findUniqueOrThrow({
        where: { id: first.id },
        select: { createdByStaffId: true },
      }),
    ).resolves.toEqual({ createdByStaffId: E2E_STAFF_ID });
    expect(
      await legacyAuthorOf(ctx.prisma, "feature_access_exemptions.created_by_sub", first.id),
    ).toBeNull();

    await admin().delete(`/admin/feature-access/shop/exemptions/${first.id}`).expect(204);

    expect(await ctx.prisma.featureAccessExemption.count()).toBe(0);
    await admin().delete(`/admin/feature-access/shop/exemptions/${first.id}`).expect(404);
  });

  it("refuse en 400 ce qui n'est pas une adresse", async () => {
    await admin()
      .post("/admin/feature-access/shop/exemptions")
      .send({ email: "pas-une-adresse" })
      .expect(400);
  });

  it("dit pour chaque adresse si un compte la porte, et s'il l'a prouvée", async () => {
    await createUser(ctx.prisma, {
      auth0Sub: "auth0|verifie",
      email: "verifie@exemple.fr",
      emailVerified: true,
    });
    await createUser(ctx.prisma, {
      auth0Sub: "auth0|non-verifie",
      email: "Non-Verifie@exemple.fr",
      emailVerified: false,
    });
    for (const email of ["verifie@exemple.fr", "non-verifie@exemple.fr", "personne@exemple.fr"]) {
      await admin().post("/admin/feature-access/shop/exemptions").send({ email }).expect(201);
    }

    const states = Object.fromEntries(
      ((await board()).features[0]?.exemptions ?? []).map((row) => [row.email, row.accountState]),
    );

    expect(states).toEqual({
      "verifie@exemple.fr": "verified",
      "non-verifie@exemple.fr": "unverified",
      "personne@exemple.fr": "none",
    });
  });
});

describe("la résolution, contre la vraie base", () => {
  it("ouvre à l'adresse prouvée et exemptée, pas à la même adresse non prouvée", async () => {
    await admin().put("/admin/feature-access/shop").send({ value: "closed" }).expect(204);
    await admin()
      .post("/admin/feature-access/shop/exemptions")
      .send({ email: TESTER_EMAIL })
      .expect(201);
    const resolver = ctx.app.get(FeatureLevelResolver);

    await expect(
      resolver.levelFor("shop", { email: "Testeur@Exemple.fr", emailProven: true }),
    ).resolves.toBe("order");
    await expect(
      resolver.levelFor("shop", { email: TESTER_EMAIL, emailProven: false }),
    ).resolves.toBe("closed");
    await expect(resolver.levelFor("shop", null)).resolves.toBe("closed");
  });
});

describe("le mur staff", () => {
  it("laisse le commercial LIRE, et lui refuse chaque écriture", async () => {
    const commercial = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(COMMERCIAL_SUB);

    await commercial().get("/admin/feature-access").expect(200);
    await commercial().put("/admin/feature-access/shop").send({ value: "closed" }).expect(403);
    await commercial().delete("/admin/feature-access/shop").expect(403);
    await commercial()
      .post("/admin/feature-access/shop/exemptions")
      .send({ email: TESTER_EMAIL })
      .expect(403);
    await commercial().delete("/admin/feature-access/shop/exemptions/inexistant").expect(403);

    expect(await ctx.prisma.featureAccessOverride.count()).toBe(0);
    expect(await ctx.prisma.featureAccessExemption.count()).toBe(0);
  });
});

describe("GET /feature-access — public", () => {
  it("répond sans jeton, et ne révèle aucune adresse exemptée", async () => {
    await admin()
      .post("/admin/feature-access/shop/exemptions")
      .send({ email: TESTER_EMAIL })
      .expect(201);

    const response = await ctx.http().get("/feature-access").expect(200);

    expect(jsonBody<FeatureLevelsView>(response)).toEqual({ shop: "order", ...OTHER_DEFAULTS });
    expect(response.text).not.toContain("@");
  });
});
