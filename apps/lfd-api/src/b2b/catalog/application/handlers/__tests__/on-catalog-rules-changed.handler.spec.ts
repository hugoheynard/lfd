import type { SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

import { CatalogFactPayloadError } from "../../../../../pim/channels/b2b-platform/products/catalog-category-changed.fact.js";
import { CatalogRulesChangedFact } from "../../../../../pim/channels/b2b-platform/products/catalog-rules-changed.fact.js";
import { CatalogRulesProjection } from "../../../domain/ports/catalog-rules.projection.js";
import { RecordingOrderLimits } from "../../../domain/ports/__tests__/recording-order-limits.js";
import { OrderLimitsRefresher } from "../../order-limits-refresher.service.js";
import { OnCatalogRulesChangedHandler } from "../on-catalog-rules-changed.handler.js";

/**
 * Le récepteur des règles globales (lot 2b) : l'échelle rangée sous
 * condition, puis descendue sur tous les articles — et rien si un fait plus
 * récent est déjà appliqué.
 */

const EMITTED = "2030-01-01T09:00:00.000Z";
const RULES: SyncOrderTimeLimitRule[] = [
  { scope: { type: "global", id: null }, daysBefore: 1, time: "18:00", graceMinutes: null },
];

class SpyingRules extends CatalogRulesProjection {
  recorded: { rules: readonly SyncOrderTimeLimitRule[]; seq: number; at: Date } | null = null;
  constructor(private readonly newer: boolean) {
    super();
  }
  recordOrderTimeLimitsIfNewer(
    rules: readonly SyncOrderTimeLimitRule[],
    seq: number,
    receivedAt: Date,
  ): Promise<boolean> {
    this.recorded = { rules, seq, at: receivedAt };
    return Promise.resolve(this.newer);
  }
}

async function deliver(projection: CatalogRulesProjection, limits: RecordingOrderLimits) {
  const fact = new CatalogRulesChangedFact(9, EMITTED, RULES);
  await new OnCatalogRulesChangedHandler(projection, new OrderLimitsRefresher(limits)).handle({
    eventId: "evt_1",
    ...fact.durableFact(),
  });
}

describe("OnCatalogRulesChangedHandler", () => {
  it("range l'échelle sous son numéro, puis la descend sur tous les articles", async () => {
    const projection = new SpyingRules(true);
    const limits = new RecordingOrderLimits(RULES);

    await deliver(projection, limits);

    expect(projection.recorded).toEqual({ rules: RULES, seq: 9, at: new Date(EMITTED) });
    expect(limits.asked).toEqual([null]);
  });

  it("ne descend rien quand un fait plus récent est déjà appliqué", async () => {
    const limits = new RecordingOrderLimits(RULES);

    await deliver(new SpyingRules(false), limits);

    expect(limits.asked).toEqual([]);
  });

  it("lève sur un fait illisible : la livraison se rejoue, rien n'est avalé", async () => {
    const projection = new SpyingRules(true);

    await expect(
      new OnCatalogRulesChangedHandler(
        projection,
        new OrderLimitsRefresher(new RecordingOrderLimits()),
      ).handle({ eventId: "evt_2", type: "pim.catalog_rules_changed", payload: { seq: 1 } }),
    ).rejects.toBeInstanceOf(CatalogFactPayloadError);
    expect(projection.recorded).toBeNull();
  });
});
