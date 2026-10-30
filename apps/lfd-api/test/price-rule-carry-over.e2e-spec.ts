/**
 * E2E du **report d'une règle de prix sur la référence née d'un détachement**
 * (`documentation/pricing/plan-report-apres-detachement.md`, R1, § 7).
 *
 * Ce que seul ce niveau prouve : la filiation lue au vrai catalogue du
 * commerce, la règle posée à la caisse sur la NOUVELLE référence, l'origine
 * écrite en `jsonb`, le second report refusé sous verrou, et le mur des
 * articles réservés à une autre société.
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
  PART_PRO_PRICE_MILLICENTS,
  quotedPrice,
  staffOf,
  stubAdminVerifier,
} from "./decision-carry-over-scene.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const CLIENT = "auth0|report_regle";
const NEGOTIATED_MILLICENTS = 700_000;

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

/**
 * Une règle de société sur la part, puis la part détachée. D'étage `geste`
 * depuis L12 (2026-10-30) : l'étage `promotion` ne s'écrit plus, et le report
 * éprouvé ici ne dépend pas de l'étage.
 */
async function detachedWithRule(): Promise<{
  companyId: string;
  ruleId: string;
  oldSku: string;
  newSku: string;
}> {
  const part = await aPart(ctx);
  const companyId = await aClient(ctx, CLIENT);
  const ruleId = jsonBody<CreatedIdResponse>(
    await staffOf(ctx)
      .post("/admin/pricing/rules")
      .send({
        stage: "geste",
        label: "Prix de la part",
        scope: { type: "variant", id: part.oldSku },
        audience: { type: "company", id: companyId },
        minQuantity: null,
        effect: { nature: "replace", amountMillicents: NEGOTIATED_MILLICENTS },
        validFrom: daysAgo(3),
        validTo: daysAgo(-30),
      })
      .expect(201),
  ).id;
  const newSku = await detach(ctx, part);
  return { companyId, ruleId, oldSku: part.oldSku, newSku };
}

const carry = (ruleId: string, fromSku: string, toSku: string) =>
  carryOver(ctx, `/admin/pricing/rules/${ruleId}/carry-over`, { fromSku, toSku });

describe("le report d'une règle sur la référence détachée (R1)", () => {
  it("🔴 la nouvelle référence est facturée au prix de la règle, à partir de maintenant", async () => {
    const { companyId, ruleId, oldSku, newSku } = await detachedWithRule();
    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(PART_PRO_PRICE_MILLICENTS);
    const before = new Date();

    const posed = jsonBody<CreatedIdResponse>(await carry(ruleId, oldSku, newSku).expect(201));

    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(NEGOTIATED_MILLICENTS);
    const row = await ctx.prisma.priceRule.findUniqueOrThrow({ where: { id: posed.id } });
    expect(row).toMatchObject({
      scopeType: "variant",
      scopeId: newSku,
      audienceType: "company",
      audienceId: companyId,
      origin: { kind: "detached", fromSku: oldSku, fromDecisionId: ruleId },
    });
    // Jamais rétroactif : une lecture datée d'hier ne voit pas la règle reportée.
    expect(row.validFrom.getTime()).toBeGreaterThanOrEqual(before.getTime());
    const event = await ctx.prisma.pricingEvent.findFirstOrThrow({
      where: { subjectType: "rule", subjectId: posed.id },
    });
    expect(event).toMatchObject({ act: "posed", reason: CARRY_REASON });
  });

  it("refuse un second report pour la même société (409)", async () => {
    const { ruleId, oldSku, newSku } = await detachedWithRule();
    await carry(ruleId, oldSku, newSku).expect(201);

    const refused = await carry(ruleId, oldSku, newSku).expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("pricing.carry_over.already_carried");
  });

  it("refuse une référence qui n'est pas née de l'ancienne (409)", async () => {
    const { ruleId, oldSku } = await detachedWithRule();
    const stranger = await ctx.prisma.catalogItem.findFirstOrThrow({
      where: { detachedFromSku: null, withdrawnAt: null, sku: { not: oldSku } },
      select: { sku: true },
    });

    await carry(ruleId, oldSku, stranger.sku).expect(409);
  });

  it("🔴 mur : la règle de la société A ne se reporte pas vers un article réservé à B", async () => {
    const { ruleId, oldSku, newSku } = await detachedWithRule();
    const other = await createCompany(ctx.prisma);
    await staffOf(ctx).put(`/admin/catalog/${newSku}/reservations/${other.id}`).expect(204);

    const refused = await carry(ruleId, oldSku, newSku).expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("catalog.reserved_article");
    expect(await ctx.prisma.priceRule.count({ where: { scopeId: newSku } })).toBe(0);
  });

  it("une règle en pause se reporte en pause : le prix coupé reste coupé", async () => {
    const { companyId, ruleId, oldSku, newSku } = await detachedWithRule();
    await staffOf(ctx)
      .post(`/admin/pricing/rules/${ruleId}/pause`)
      .send({ reason: "Prix suspendu" })
      .expect(204);

    const posed = jsonBody<CreatedIdResponse>(await carry(ruleId, oldSku, newSku).expect(201));

    const row = await ctx.prisma.priceRule.findUniqueOrThrow({ where: { id: posed.id } });
    expect(row.pausedAt).not.toBeNull();
    expect(await quotedPrice(ctx, CLIENT, companyId, newSku)).toBe(PART_PRO_PRICE_MILLICENTS);
  });

  // RETIRÉ en L12 (2026-10-30) : « deux règles d'étages différents, même
  // société, toutes deux se reportent ». Une seule règle reste saisissable
  // (`geste` — `promotion` est fermé, `volume` passe par le barème, la
  // mercuriale par son écran) : le cas ne se produit plus par le vrai geste.
  // L'identité par étage reste éprouvée sans base
  // (`carry-over-decisions.handlers.spec.ts`, « une règle d'un AUTRE étage »).
});
