/**
 * E2E de la route publique des zones par clientèle (plan
 * `documentation/promotions/plan-livraison-offerte.md`, sous-lot 0c) :
 * `GET /delivery-zones?audience=b2b|b2c` sert le frais et le seuil de
 * livraison offerte RÉSOLUS — zone, sinon global, sinon ancien frais —, ceux
 * que le devis facture.
 *
 * Régression du 2026-11-05 (constatée en production par Hugo) : la route
 * servait l'ancien frais unique de la zone, et le dialogue d'adresse de la
 * boutique affichait « 0 € » pendant que le devis facturait le frais global.
 */
import {
  type AudienceDeliveryZoneView,
  type CreatedDeliveryZoneResponse,
  type ShopQuoteView,
} from "@lfd/contracts";

import { PUBLIC_SETTINGS_CACHE_TAG } from "../src/lafoliecoffee/shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { PUBLIC_SETTINGS_CACHE_CONTROL } from "../src/lafoliecoffee/shared/public-settings-cache/http/public-settings-cache-headers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
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

const LEGACY_FEE = { mode: "amount", cents: 0 } as const;
const FOLLOWS_GLOBAL = { label: "Chambéry", postalPrefixes: ["730"], fee: LEGACY_FEE };
const FAR_FEE = { mode: "amount", cents: 2_500 } as const;
const OVERRIDES_PROS = {
  label: "Val d'Isère",
  postalPrefixes: ["73150"],
  fee: LEGACY_FEE,
  audienceTerms: {
    b2b: { fee: FAR_FEE, freeDeliveryThresholdCents: 20_000 },
    b2c: { fee: null, freeDeliveryThresholdCents: null },
  },
};
const GLOBAL = {
  b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: 5_000 },
  b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: 8_000 },
};

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function createZone(body: Record<string, unknown>): Promise<string> {
  const response = await staff()
    .post("/admin/delivery-zones")
    .set(INTENT_KEY, freshIntent())
    .send(body)
    .expect(201);
  return jsonBody<CreatedDeliveryZoneResponse>(response).id;
}

async function zonesFor(query: string): Promise<readonly AudienceDeliveryZoneView[]> {
  return jsonBody<AudienceDeliveryZoneView[]>(
    await ctx.http().get(`/delivery-zones${query}`).expect(200),
  );
}

function feeOf(zones: readonly AudienceDeliveryZoneView[], id: string): unknown {
  const zone = zones.find((candidate) => candidate.id === id);
  return zone === undefined ? undefined : [zone.fee, zone.freeDeliveryThresholdCents];
}

describe("GET /delivery-zones?audience= — le frais résolu par clientèle (0c)", () => {
  it("rien de réglé : l'ancien frais de la zone, sans livraison offerte, pour les deux", async () => {
    const id = await createZone(FOLLOWS_GLOBAL);

    expect(feeOf(await zonesFor("?audience=b2b"), id)).toEqual([LEGACY_FEE, null]);
    expect(feeOf(await zonesFor("?audience=b2c"), id)).toEqual([LEGACY_FEE, null]);
  });

  it("réglage global posé : la zone sans remplacement sert le global de chaque clientèle", async () => {
    const id = await createZone(FOLLOWS_GLOBAL);
    await staff().patch("/admin/delivery-pricing").send(GLOBAL).expect(204);

    expect(feeOf(await zonesFor("?audience=b2b"), id)).toEqual([GLOBAL.b2b.fee, 5_000]);
    expect(feeOf(await zonesFor("?audience=b2c"), id)).toEqual([GLOBAL.b2c.fee, 8_000]);
  });

  it("le remplacement de la zone l'emporte pour sa clientèle seule", async () => {
    const id = await createZone(OVERRIDES_PROS);
    await staff().patch("/admin/delivery-pricing").send(GLOBAL).expect(204);

    expect(feeOf(await zonesFor("?audience=b2b"), id)).toEqual([FAR_FEE, 20_000]);
    expect(feeOf(await zonesFor("?audience=b2c"), id)).toEqual([GLOBAL.b2c.fee, 8_000]);
  });

  it("sans paramètre : la clientèle d'un visiteur (particulier)", async () => {
    await createZone(OVERRIDES_PROS);
    await staff().patch("/admin/delivery-pricing").send(GLOBAL).expect(204);

    expect(await zonesFor("")).toEqual(await zonesFor("?audience=b2c"));
    expect((await zonesFor("")).every((zone) => zone.audience === "b2c")).toBe(true);
  });

  it("annonce le frais que le devis d'un visiteur facture", async () => {
    const id = await createZone(OVERRIDES_PROS);
    await staff().patch("/admin/delivery-pricing").send(GLOBAL).expect(204);

    const quote = await ctx
      .http()
      .post("/shop/quote")
      .send({
        lines: [{ sku: "VIE-001-1", quantity: 10 }],
        fulfillment: { method: "delivery", codePostal: "73150" },
      })
      .expect(200);
    const announced = (await zonesFor("?audience=b2c")).find((zone) => zone.id === id);
    expect(announced?.fee).toEqual({ mode: "amount", cents: 1_500 });
    expect(jsonBody<ShopQuoteView>(quote).deliveryFeeCents).toBe(1_500);
  });

  it("refuse une clientèle inconnue (400) plutôt que de la ramener au particulier", async () => {
    await ctx.http().get("/delivery-zones?audience=pro").expect(400);
  });

  it.each(["?audience=b2b", "?audience=b2c", ""])(
    "%s s'offre à Workers Cache, étiqueté pour la purge",
    async (query) => {
      const response = await ctx.http().get(`/delivery-zones${query}`).expect(200);
      expect(response.headers["cache-control"]).toBe(PUBLIC_SETTINGS_CACHE_CONTROL);
      expect(response.headers["cache-tag"]).toBe(PUBLIC_SETTINGS_CACHE_TAG);
    },
  );
});
