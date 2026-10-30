/**
 * E2E du **rangement du fournil** (Hugo, 2026-10-30) — « Afficher les
 * sous-catégories », sur le vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : la ligne absente servie en défaut
 * (`false`), le réglage aller-retour avec son auteur figé et son fait dans
 * la même transaction, la forme refusée sans rien écrire, et le réglage servi
 * avec le prévisionnel, que la matrice et le dossier de l'écran lisent.
 */
import type { ProductionForecastView, ProductionSettingsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

const SETTINGS = "/admin/production/settings";
const DISPLAY = `${SETTINGS}/display`;
const DAY = serviceDay();

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
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function settings(): Promise<ProductionSettingsView> {
  return jsonBody<ProductionSettingsView>(await staff().get(SETTINGS).expect(200));
}

async function forecast(): Promise<ProductionForecastView> {
  return jsonBody<ProductionForecastView>(
    await staff().get(`/admin/production/forecast?from=${DAY}&to=${DAY}`).expect(200),
  );
}

describe("Réglages › Production › Rangement des fiches", () => {
  it("sans réglage : les sous-catégories ne s'affichent pas, au réglage comme au prévisionnel", async () => {
    expect((await settings()).display).toEqual({ showSubcategories: false });
    expect((await forecast()).showSubcategories).toBe(false);
  });

  it("affiche les sous-catégories, fige l'auteur et journalise dans la même transaction", async () => {
    await staff().put(DISPLAY).send({ showSubcategories: true }).expect(204);

    expect((await settings()).display).toEqual({ showSubcategories: true });
    expect((await forecast()).showSubcategories).toBe(true);
    const row = await ctx.prisma.productionDisplaySettings.findUniqueOrThrow({
      where: { key: "house" },
    });
    expect(row.updatedByStaffId).toBe(E2E_STAFF_ID);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_display_settings.updated" },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      { showSubcategories: true, previous: { showSubcategories: false } },
    ]);
  });

  it("refuse une forme invalide en 400, sans rien écrire", async () => {
    await staff().put(DISPLAY).send({ showSubcategories: "oui" }).expect(400);

    expect(await ctx.prisma.productionDisplaySettings.count()).toBe(0);
  });
});
