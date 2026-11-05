import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { CacheOutcomeRecorder } from "../../../../platform/metrics/cache-outcome-recorder.js";
import { RecordingCacheOutcomes } from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { PricingMaterialsCache } from "../pricing-materials.cache.js";

/** Le journal tarifaire réduit à son estampille, qu'on fait monter à la main. */
class ManualPricingStamp {
  id = "01A";
  readonly pricingEvent = {
    findFirst: (): Promise<{ id: string }> => Promise.resolve({ id: this.id }),
  };
}

async function setup(): Promise<{
  readonly cache: PricingMaterialsCache;
  readonly stamp: ManualPricingStamp;
  readonly outcomes: RecordingCacheOutcomes;
}> {
  const stamp = new ManualPricingStamp();
  const outcomes = new RecordingCacheOutcomes();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PricingMaterialsCache,
      { provide: PrismaService, useValue: stamp },
      { provide: CacheOutcomeRecorder, useValue: outcomes },
    ],
  }).compile();
  return { cache: moduleRef.get(PricingMaterialsCache), stamp, outcomes };
}

const load = (): Promise<readonly string[]> => Promise.resolve(["règle"]);

describe("PricingMaterialsCache — les issues comptées pour la carte de santé (C5)", () => {
  it("compte « miss » à la première question, « hit » tant que l'estampille tient", async () => {
    const { cache, outcomes } = await setup();
    await cache.of("price-rules", load);
    await cache.of("price-rules", load);
    expect(outcomes.recorded).toEqual(["pricing.materials:miss", "pricing.materials:hit"]);
  });

  it("compte « stamp_moved » quand une écriture a fait bouger l'estampille", async () => {
    const { cache, stamp, outcomes } = await setup();
    await cache.of("price-rules", load);
    stamp.id = "01B";
    await cache.of("price-rules", load);
    expect(outcomes.recorded).toEqual(["pricing.materials:miss", "pricing.materials:stamp_moved"]);
  });

  it("compte « miss » après un `invalidate()`, qui ne laisse rien de gardé", async () => {
    const { cache, outcomes } = await setup();
    await cache.of("price-rules", load);
    cache.invalidate();
    await cache.of("price-rules", load);
    expect(outcomes.recorded).toEqual(["pricing.materials:miss", "pricing.materials:miss"]);
  });
});
