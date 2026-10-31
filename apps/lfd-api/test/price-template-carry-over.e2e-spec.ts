/**
 * E2E du **remplacement de l'ancienne référence dans un gabarit**
 * (`documentation/pricing/saisie/plan-report-apres-detachement.md`, § 2.2, R5).
 *
 * Ce que seul ce niveau prouve : la ligne du gabarit change de référence en
 * base, paliers gardés, sous la garde de filiation lue au vrai catalogue ; le
 * panneau des décisions de l'ancienne ne le montre plus, celui de la nouvelle
 * si.
 */
import type { CreatedIdResponse, SaleReferenceDecisionView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { SILENT_TRIGGER } from "./catalog-facts-scene.js";
import {
  aPart,
  carryOver,
  detach,
  staffOf,
  stubAdminVerifier,
} from "./decision-carry-over-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const TIERS = [{ minQuantity: 1, unitPriceMillicents: 800_000 }];

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

async function detachedWithTemplate(): Promise<{
  templateId: string;
  oldSku: string;
  newSku: string;
}> {
  const part = await aPart(ctx);
  const templateId = jsonBody<CreatedIdResponse>(
    await staffOf(ctx)
      .post("/admin/pricing/templates")
      .send({
        kind: "mercuriale",
        label: "Hôtels",
        lines: [{ sku: part.oldSku, tiers: TIERS, plannedVolume: 40 }],
      })
      .expect(201),
  ).id;
  const newSku = await detach(ctx, part);
  return { templateId, oldSku: part.oldSku, newSku };
}

const decisionsOn = async (sku: string): Promise<readonly SaleReferenceDecisionView[]> =>
  jsonBody<readonly SaleReferenceDecisionView[]>(
    await staffOf(ctx).get(`/admin/pricing/sale-references/${sku}/decisions`).expect(200),
  );

describe("le gabarit après un détachement (R5)", () => {
  it("🔴 remplace la ligne de l'ancienne référence par la nouvelle, paliers gardés", async () => {
    const { templateId, oldSku, newSku } = await detachedWithTemplate();

    await carryOver(ctx, `/admin/pricing/templates/${templateId}/carry-over`, {
      fromSku: oldSku,
      toSku: newSku,
    }).expect(201);

    const row = await ctx.prisma.priceTemplate.findUniqueOrThrow({ where: { id: templateId } });
    expect(row.lines).toEqual([{ sku: newSku, tiers: TIERS, plannedVolume: 40 }]);
    expect((await decisionsOn(oldSku)).map((view) => view.id)).not.toContain(templateId);
    expect((await decisionsOn(newSku)).map((view) => view.id)).toContain(templateId);
  });

  it("refuse une seconde fois : la nouvelle référence est déjà dans le gabarit (409)", async () => {
    const { templateId, oldSku, newSku } = await detachedWithTemplate();
    const route = `/admin/pricing/templates/${templateId}/carry-over`;
    await carryOver(ctx, route, { fromSku: oldSku, toSku: newSku }).expect(201);

    await carryOver(ctx, route, { fromSku: oldSku, toSku: newSku }).expect(409);
  });
});
