import { instantToLocal, localToInstant } from "@lfd/contracts";

import type { E2eContext } from "../e2e-harness.js";
import { createCompany } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { routeKey, STAFF, type ReplayWorld, type ScenarioSet } from "./scenario.js";

const HTTP = "lafoliecoffee/pricing/http";
/** VIE-001-1 vaut 200 c dans le catalogue semé par le harnais. */
const SKU = "VIE-001-1";
const DAY_MS = 86_400_000;
const HALF_DAY_MS = 43_200_000;

/** Minuit à Paris, dans `days` jours de l'horloge du scénario (négatif = passé). */
function parisMidnight(world: ReplayWorld, days: number): string {
  const shifted = new Date(world.clock.now().getTime() + days * DAY_MS + HALF_DAY_MS);
  const instant = localToInstant(instantToLocal(shifted).day, "00:00");
  if (instant === null) throw new Error("e2e : minuit introuvable à Paris.");
  return instant.toISOString();
}

/**
 * Une mercuriale posée par la route : `{ companyId, mercurialeId }`. Sa
 * fenêtre en jours de l'horloge ; une fenêtre à venir se corrige encore.
 */
async function posedMercuriale(
  world: ReplayWorld,
  window: { readonly from: number; readonly to: number | null } = { from: -30, to: 365 },
): Promise<{ readonly companyId: string; readonly mercurialeId: string }> {
  const company = await createCompany(world.ctx.prisma);
  await world.ctx
    .asSub(STAFF)
    .post(`/admin/pricing/companies/${company.id}/mercuriale`)
    .set(INTENT_KEY, freshIntent())
    .send({
      label: "Mercuriale de saison",
      validFrom: parisMidnight(world, window.from),
      validTo: window.to === null ? null : parisMidnight(world, window.to),
      lines: [{ sku: SKU, unitPriceMillicents: 150_000 }],
    })
    .expect(201);
  const row = await world.ctx.prisma.companyMercuriale.findFirstOrThrow({
    where: { companyId: company.id },
    select: { id: true },
  });
  return { companyId: company.id, mercurialeId: row.id };
}

/** Une limite posée par la route. */
async function putFloor(
  ctx: E2eContext,
  scope: object,
  mode: string,
  value: number,
): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put("/admin/pricing/floors")
    .set(INTENT_KEY, freshIntent())
    .send({ scope, mode, value, dynamic: null })
    .expect(204);
}

/** La tarification : règles, barèmes, limites, grilles, engagements, mercuriales. */
export const PRICING_SCENARIOS: ScenarioSet = {
  [routeKey(`${HTTP}/admin-pricing.controller.ts`, "createRule")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/pricing/rules",
      body: {
        stage: "geste",
        scope: { type: "global", id: null },
        audience: { type: "all", id: null },
        minQuantity: null,
        effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1000 },
        label: "Geste",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
      },
    }),

  [routeKey(`${HTTP}/admin-pricing.controller.ts`, "setVolumeLadder")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/pricing/volume-ladders",
      body: {
        scope: { type: "product", id: SKU },
        audience: { type: "all", id: null },
        unit: "percent",
        tiers: [
          { minQuantity: 50, value: 500 },
          { minQuantity: 100, value: 1_000 },
        ],
        label: "Barème croissant",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
      },
    }),

  [routeKey(`${HTTP}/admin-price-floors.controller.ts`, "setFloor")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/pricing/floors",
      body: { scope: { type: "global", id: null }, mode: "percent", value: 5_000, dynamic: null },
    }),

  [routeKey(`${HTTP}/admin-price-floors.controller.ts`, "confirmFloor")]: async ({ ctx }) => {
    await putFloor(ctx, { type: "product", id: SKU }, "amount", 150);
    return { sub: STAFF, path: `/admin/pricing/floors/product/${SKU}/confirm` };
  },

  [routeKey(`${HTTP}/admin-price-floors.controller.ts`, "confirmGlobalFloor")]: async ({ ctx }) => {
    await putFloor(ctx, { type: "global", id: null }, "percent", 5_000);
    return { sub: STAFF, path: "/admin/pricing/floors/global/confirm" };
  },

  [routeKey(`${HTTP}/admin-price-templates.controller.ts`, "compose")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/pricing/templates",
      body: {
        kind: "mercuriale",
        label: "Mercuriale Club",
        lines: [{ sku: SKU, tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
      },
    }),

  [routeKey(`${HTTP}/admin-volume-commitments.controller.ts`, "sign")]: async ({ ctx }) => {
    const company = await createCompany(ctx.prisma);
    return {
      sub: STAFF,
      path: "/admin/pricing/commitments",
      body: {
        companyId: company.id,
        scope: { type: "product", id: SKU },
        promisedQuantity: 500,
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2027-01-01T00:00:00.000Z",
      },
    };
  },

  [routeKey(`${HTTP}/admin-company-pricing.controller.ts`, "pose")]: async (world) => {
    const company = await createCompany(world.ctx.prisma);
    return {
      sub: STAFF,
      path: `/admin/pricing/companies/${company.id}/mercuriale`,
      body: {
        label: "Mercuriale de saison",
        validFrom: parisMidnight(world, -1),
        validTo: parisMidnight(world, 365),
        lines: [{ sku: SKU, unitPriceMillicents: 150_000 }],
      },
    };
  },

  [routeKey(`${HTTP}/admin-company-pricing.controller.ts`, "amend")]: async (world) => {
    const { companyId, mercurialeId } = await posedMercuriale(world);
    return {
      sub: STAFF,
      path: `/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/amendments`,
      body: {
        reason: "Pain au chocolat ajouté à la demande du chef",
        lines: [{ sku: "VIE-002-1", unitPriceMillicents: 170_000 }],
      },
    };
  },

  [routeKey(`${HTTP}/admin-company-pricing.controller.ts`, "correctWindow")]: async (world) => {
    const { companyId, mercurialeId } = await posedMercuriale(world, { from: 365, to: null });
    return {
      sub: STAFF,
      path: `/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/window`,
      body: {
        validFrom: parisMidnight(world, 0),
        validTo: null,
        reason: "Posée un an trop tard par erreur",
        basedOnAmendmentId: null,
      },
    };
  },
};
