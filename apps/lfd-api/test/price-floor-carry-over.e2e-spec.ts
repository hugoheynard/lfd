/**
 * E2E du **report d'un plancher sur la référence née d'un détachement**
 * (`documentation/pricing/plan-report-apres-detachement.md`, § 2.3, R2, § 7).
 *
 * Ce que seul ce niveau prouve : le pourcentage reporté s'applique au prix de
 * la NOUVELLE référence à la caisse ; un second report est refusé même après
 * que le plancher d'origine a changé de version ; et la route vit sous
 * `lfc_price_limits` — un staff sans ce droit reçoit 403, quand bien même il
 * pose des règles.
 */
import type { CreatedIdResponse } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { SILENT_TRIGGER } from "./catalog-facts-scene.js";
import {
  aClient,
  aPart,
  CARRY_REASON,
  carryOver,
  detach,
  quotedPrice,
  staffOf,
  stubAdminVerifier,
} from "./decision-carry-over-scene.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

const CLIENT = "auth0|report_plancher";
/** 90 % du prix pro de la part (10 €). */
const FLOOR_BP = 9_000;
const FLOORED_MILLICENTS = 900_000;
/** −50 % : la règle qui descendrait sous le plancher. */
const HALF_PRICE_MILLICENTS = 500_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const putFloor = (sku: string) =>
  staffOf(ctx)
    .put("/admin/pricing/floors")
    .send({
      scope: { type: "variant", id: sku },
      mode: "percent",
      value: FLOOR_BP,
      clientele: "pro",
    })
    .expect(204);

async function floorIdOn(sku: string): Promise<string> {
  const row = await ctx.prisma.priceFloor.findFirstOrThrow({
    where: { scopeId: sku, archivedAt: null, validTo: null },
    select: { id: true },
  });
  return row.id;
}

/** Un plancher pro sur la part, la part détachée, et une demi-remise sur la nouvelle. */
async function detachedWithFloor(): Promise<{ floorId: string; oldSku: string; newSku: string }> {
  const part = await aPart(ctx);
  await putFloor(part.oldSku);
  const floorId = await floorIdOn(part.oldSku);
  const newSku = await detach(ctx, part);
  await staffOf(ctx)
    .post("/admin/pricing/rules")
    .send({
      // `geste` depuis L12 (2026-10-30) : l'étage `promotion` ne s'écrit plus, et la
      // mécanique éprouvée ici ne dépend pas de l'étage.
      stage: "geste",
      label: "Demi-prix",
      scope: { type: "variant", id: newSku },
      audience: { type: "all", id: null },
      minQuantity: null,
      effect: { nature: "alter", direction: "decrease", mode: "percent", value: 5_000 },
      validFrom: daysAgo(1),
      validTo: daysAgo(-30),
    })
    .expect(201);
  return { floorId, oldSku: part.oldSku, newSku };
}

const carry = (floorId: string, fromSku: string, toSku: string) =>
  carryOver(ctx, `/admin/pricing/floors/${floorId}/carry-over`, { fromSku, toSku });

describe("le report d'un plancher sur la référence détachée (R2)", () => {
  it("🔴 le pourcentage reporté retient le prix de la nouvelle référence, dès maintenant", async () => {
    const { floorId, oldSku, newSku } = await detachedWithFloor();
    const companyId = await aClient(ctx, CLIENT);
    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(HALF_PRICE_MILLICENTS);
    const before = new Date();

    const posed = jsonBody<CreatedIdResponse>(await carry(floorId, oldSku, newSku).expect(201));

    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(FLOORED_MILLICENTS);
    const row = await ctx.prisma.priceFloor.findUniqueOrThrow({ where: { id: posed.id } });
    expect(row).toMatchObject({
      scopeId: newSku,
      clientele: "pro",
      mode: "percent",
      value: FLOOR_BP,
      validTo: null,
      origin: { kind: "detached", fromSku: oldSku, fromDecisionId: floorId },
    });
    expect(row.validFrom.getTime()).toBeGreaterThanOrEqual(before.getTime());
    const event = await ctx.prisma.pricingEvent.findFirstOrThrow({
      where: { subjectType: "floor", subjectId: `variant:${newSku}` },
    });
    expect(event).toMatchObject({ act: "carried", reason: CARRY_REASON });
  });

  it("refuse un second report, même après une nouvelle version du plancher d'origine", async () => {
    const { floorId, oldSku, newSku } = await detachedWithFloor();
    await carry(floorId, oldSku, newSku).expect(201);
    // Confirmer re-pose une version neuve : l'identifiant d'origine change.
    await staffOf(ctx)
      .post(`/admin/pricing/floors/variant/${oldSku}/confirm?clientele=pro`)
      .expect(204);
    const nextVersion = await floorIdOn(oldSku);
    expect(nextVersion).not.toBe(floorId);

    const refused = await carry(nextVersion, oldSku, newSku).expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("pricing.carry_over.already_carried");
  });

  it("refuse si un plancher arbitre déjà la nouvelle référence — il ne le remplace pas", async () => {
    const { floorId, oldSku, newSku } = await detachedWithFloor();
    await putFloor(newSku);

    const refused = await carry(floorId, oldSku, newSku).expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("pricing.carry_over.floor_in_force");
  });

  it("🔴 garde : un staff sans `lfc_price_limits` reçoit 403", async () => {
    const { floorId, oldSku, newSku } = await detachedWithFloor();
    const sub = "staff-commercial";
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "commercial",
        email: "commercial@lfc.test",
        role: "commercial",
        status: "active",
        auth0Id: sub,
      },
    });

    const refused = await ctx
      .asSub(sub)
      .post(`/admin/pricing/floors/${floorId}/carry-over`)
      .send({ fromSku: oldSku, toSku: newSku, reason: CARRY_REASON });

    expect(refused.status).toBe(403);
    expect(await ctx.prisma.priceFloor.count({ where: { scopeId: newSku } })).toBe(0);
  });
});
