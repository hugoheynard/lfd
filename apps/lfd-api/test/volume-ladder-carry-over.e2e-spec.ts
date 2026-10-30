/**
 * E2E du **report d'un barème de volume sur la référence née d'un
 * détachement** (`documentation/pricing/plan-report-apres-detachement.md`, R3, § 7).
 *
 * Ce que seul ce niveau prouve : les paliers reportés font le prix de la
 * NOUVELLE référence à la caisse, un barème en pause se reporte en pause
 * (§ 7 bis) — il ne rallume pas une remise coupée —, et le second report est
 * refusé.
 */
import type { CreatedIdResponse } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { SILENT_TRIGGER } from "./catalog-facts-scene.js";
import {
  aClient,
  aPart,
  carryOver,
  detach,
  PART_PRO_PRICE_MILLICENTS,
  quotedPrice,
  staffOf,
  stubAdminVerifier,
} from "./decision-carry-over-scene.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

const CLIENT = "auth0|report_bareme";
/** −10 % dès la première pièce. */
const TIER_MILLICENTS = 900_000;

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

/** Un barème « tous » sur la part, puis la part détachée. */
async function detachedWithLadder(): Promise<{ ladderId: string; oldSku: string; newSku: string }> {
  const part = await aPart(ctx);
  const ladderId = jsonBody<CreatedIdResponse>(
    await staffOf(ctx)
      .put("/admin/pricing/volume-ladders")
      .send({
        scope: { type: "variant", id: part.oldSku },
        audience: { type: "all", id: null },
        unit: "percent",
        tiers: [{ minQuantity: 1, value: 1_000 }],
        label: "Volume de la part",
        validFrom: daysAgo(3),
        validTo: null,
      })
      .expect(201),
  ).id;
  const newSku = await detach(ctx, part);
  return { ladderId, oldSku: part.oldSku, newSku };
}

const carry = (ladderId: string, fromSku: string, toSku: string) =>
  carryOver(ctx, `/admin/pricing/volume-ladders/${ladderId}/carry-over`, { fromSku, toSku });

describe("le report d'un barème sur la référence détachée (R3)", () => {
  it("🔴 la nouvelle référence est facturée au palier reporté, à partir de maintenant", async () => {
    const { ladderId, oldSku, newSku } = await detachedWithLadder();
    const companyId = await aClient(ctx, CLIENT);
    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(PART_PRO_PRICE_MILLICENTS);
    const before = new Date();

    const posed = jsonBody<CreatedIdResponse>(await carry(ladderId, oldSku, newSku).expect(201));

    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(TIER_MILLICENTS);
    const row = await ctx.prisma.volumeLadder.findUniqueOrThrow({ where: { id: posed.id } });
    expect(row).toMatchObject({
      scopeId: newSku,
      pausedAt: null,
      origin: { kind: "detached", fromSku: oldSku, fromDecisionId: ladderId },
    });
    expect(row.validFrom.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("un barème en pause se reporte en pause : la remise reste coupée", async () => {
    const { ladderId, oldSku, newSku } = await detachedWithLadder();
    const companyId = await aClient(ctx, CLIENT);
    await staffOf(ctx)
      .post(`/admin/pricing/volume-ladders/${ladderId}/pause`)
      .send({ reason: "Remise suspendue" })
      .expect(204);

    const posed = jsonBody<CreatedIdResponse>(await carry(ladderId, oldSku, newSku).expect(201));

    const row = await ctx.prisma.volumeLadder.findUniqueOrThrow({ where: { id: posed.id } });
    expect(row.pausedAt).not.toBeNull();
    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(PART_PRO_PRICE_MILLICENTS);
  });

  it("refuse un second report (409)", async () => {
    const { ladderId, oldSku, newSku } = await detachedWithLadder();
    await carry(ladderId, oldSku, newSku).expect(201);

    const refused = await carry(ladderId, oldSku, newSku).expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("pricing.carry_over.already_carried");
  });
});
