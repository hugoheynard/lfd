/**
 * E2E du **report d'un engagement de volume sur la référence née d'un
 * détachement** (`documentation/pricing/saisie/plan-report-apres-detachement.md`,
 * § 2.1, R4, § 7).
 *
 * Ce que seul ce niveau prouve : la quantité promise, recopiée, ouvre le
 * palier de la NOUVELLE référence dès le jour du report (`max(promis,
 * livré)`) ; un engagement de famille de la même société ne le détrône pas ;
 * l'ancien court toujours ; le second report est refusé.
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

const CLIENT = "auth0|report_engagement";
const PROMISED = 500;
/** −10 % à partir de 100 pièces : seule la promesse l'ouvre sur une commande d'une pièce. */
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

const sign = (companyId: string, scope: { type: string; id: string }, promisedQuantity: number) =>
  staffOf(ctx)
    .post("/admin/pricing/commitments")
    .send({ companyId, scope, promisedQuantity, validFrom: daysAgo(3), validTo: daysAgo(-60) })
    .expect(201);

/** Un engagement sur la part, la part détachée, et un barème sur la nouvelle référence. */
async function detachedWithCommitment(): Promise<{
  companyId: string;
  commitmentId: string;
  oldSku: string;
  newSku: string;
}> {
  const part = await aPart(ctx);
  const companyId = await aClient(ctx, CLIENT);
  const commitmentId = jsonBody<CreatedIdResponse>(
    await sign(companyId, { type: "variant", id: part.oldSku }, PROMISED),
  ).id;
  const newSku = await detach(ctx, part);
  await staffOf(ctx)
    .put("/admin/pricing/volume-ladders")
    .send({
      scope: { type: "variant", id: newSku },
      audience: { type: "all", id: null },
      unit: "percent",
      tiers: [{ minQuantity: 100, value: 1_000 }],
      label: "Volume de la nouvelle part",
      validFrom: daysAgo(1),
      validTo: null,
    })
    .expect(201);
  return { companyId, commitmentId, oldSku: part.oldSku, newSku };
}

const carry = (commitmentId: string, fromSku: string, toSku: string) =>
  carryOver(ctx, `/admin/pricing/commitments/${commitmentId}/carry-over`, { fromSku, toSku });

describe("le report d'un engagement sur la référence détachée (R4)", () => {
  it("🔴 la promesse reportée ouvre le palier de la nouvelle référence le jour du report", async () => {
    const { companyId, commitmentId, oldSku, newSku } = await detachedWithCommitment();
    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(PART_PRO_PRICE_MILLICENTS);

    const signed = jsonBody<CreatedIdResponse>(
      await carry(commitmentId, oldSku, newSku).expect(201),
    );

    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(TIER_MILLICENTS);
    const [carried, old] = await Promise.all([
      ctx.prisma.volumeCommitment.findUniqueOrThrow({ where: { id: signed.id } }),
      ctx.prisma.volumeCommitment.findUniqueOrThrow({ where: { id: commitmentId } }),
    ]);
    expect(carried).toMatchObject({
      companyId,
      scopeId: newSku,
      promisedQuantity: PROMISED,
      validTo: old.validTo,
      origin: { kind: "detached", fromSku: oldSku, fromDecisionId: commitmentId },
    });
    // L'ancien court jusqu'à sa fin (§ 7 bis) : rien n'est clos.
    expect(old.archivedAt).toBeNull();
  });

  it("un engagement de famille de la même société ne détrône pas le reporté", async () => {
    const { companyId, commitmentId, oldSku, newSku } = await detachedWithCommitment();
    const item = await ctx.prisma.catalogItem.findFirstOrThrow({
      where: { sku: newSku },
      select: { categoryId: true },
    });
    await sign(companyId, { type: "category", id: item.categoryId }, 5);

    await carry(commitmentId, oldSku, newSku).expect(201);

    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(TIER_MILLICENTS);
  });

  it("refuse un second report pour la même société (409)", async () => {
    const { commitmentId, oldSku, newSku } = await detachedWithCommitment();
    await carry(commitmentId, oldSku, newSku).expect(201);

    const refused = await carry(commitmentId, oldSku, newSku).expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("pricing.carry_over.already_carried");
  });
});
