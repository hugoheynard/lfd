/**
 * E2E des **réglages plateforme** : lecture publique (feature flags d'activation)
 * + écriture staff. Éprouve les défauts (livraison cachée, KBIS optionnel), la
 * porte staff sur l'écriture, et que la lecture reflète l'écriture.
 */
import type { PlatformSettings } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

describe("réglages plateforme", () => {
  it("GET public renvoie les défauts (livraison cachée, KBIS optionnel)", async () => {
    const response = await ctx.http().get("/platform-settings").expect(200);
    expect(jsonBody<PlatformSettings>(response)).toEqual({
      tva: "required",
      kbis: "optional",
      billing: "required",
      delivery: "hidden",
      pickupAddress: null,
    });
  });

  it("PATCH staff met à jour (dont l'adresse de retrait), et la lecture le reflète", async () => {
    const next: PlatformSettings = {
      tva: "required",
      kbis: "required",
      billing: "required",
      delivery: "optional",
      pickupAddress: {
        label: "Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
      },
    };
    await staff().patch("/admin/platform-settings").send(next).expect(204);

    const response = await ctx.http().get("/platform-settings").expect(200);
    expect(jsonBody<PlatformSettings>(response)).toEqual(next);
  });

  it("refuse une charge invalide (mode inconnu) — 400", async () => {
    const response = await staff()
      .patch("/admin/platform-settings")
      .send({ tva: "required", kbis: "optional", billing: "required", delivery: "sometimes" });
    expect(response.status).toBe(400);
  });
});
