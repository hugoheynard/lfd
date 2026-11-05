import { DEFAULT_DELIVERY_PRICING, type DeliveryPricingView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import { RecordingPublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/__tests__/recording-public-settings-edge-cache.js";
import { InvalidFreeDeliveryThresholdError } from "../../domain/delivery-audience-terms.js";
import type { DeliveryPricing } from "../../domain/delivery-pricing.js";
import { DeliveryPricingReader } from "../../domain/ports/delivery-pricing.reader.js";
import { DeliveryPricingRepository } from "../../domain/ports/delivery-pricing.repository.js";
import { GetDeliveryPricingHandler } from "../get-delivery-pricing.handler.js";
import { UpdateDeliveryPricingCommand } from "../update-delivery-pricing.command.js";
import { UpdateDeliveryPricingHandler } from "../update-delivery-pricing.handler.js";

const AT = new Date(0);

class Current extends DeliveryPricingReader {
  constructor(private readonly view: DeliveryPricingView) {
    super();
  }
  current(): Promise<DeliveryPricingView> {
    return Promise.resolve(this.view);
  }
}

class Written extends DeliveryPricingRepository {
  last: DeliveryPricing | null = null;
  put(pricing: DeliveryPricing): Promise<void> {
    this.last = pricing;
    return Promise.resolve();
  }
}

class Directory extends StaffDirectory {
  constructor(private readonly identity: StaffIdentity | null) {
    super();
  }
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve(this.identity);
  }
}

function scene(current: DeliveryPricingView = DEFAULT_DELIVERY_PRICING) {
  const written = new Written();
  const edge = new RecordingPublicSettingsEdgeCache();
  const afterCommit = new HeldAfterCommit();
  const handler = new UpdateDeliveryPricingHandler(
    new Current(current),
    written,
    new Directory({ name: "Camille Durand", role: "admin" }),
    new FixedClock(AT),
    new DirectUnitOfWork(),
    afterCommit,
    edge,
  );
  return { handler, written, edge, afterCommit };
}

describe("UpdateDeliveryPricingHandler", () => {
  it("pose le frais des pros en gardant les particuliers, et fige l'instant et l'auteur", async () => {
    const { handler, written } = scene({
      ...DEFAULT_DELIVERY_PRICING,
      b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: 8_000 },
    });

    await handler.execute(
      new UpdateDeliveryPricingCommand({ b2b: { fee: { mode: "amount", cents: 900 } } }, "staff_a"),
    );

    expect(written.last?.terms).toEqual({
      b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: null },
      b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: 8_000 },
    });
    expect(written.last?.at).toBe(AT);
    expect(written.last?.author).toEqual({
      staffUserId: "staff_a",
      name: "Camille Durand",
      role: "admin",
    });
  });

  it("purge les réglages publics après la validation, et pas avant", async () => {
    const { handler, edge, afterCommit } = scene();

    await handler.execute(
      new UpdateDeliveryPricingCommand({ b2c: { freeDeliveryThresholdCents: 8_000 } }, "staff_a"),
    );
    expect(edge.purges).toBe(0);

    await afterCommit.commit();
    expect(edge.purges).toBe(1);
  });

  it("un franco négatif : refusé, rien d'écrit, rien de purgé", async () => {
    const { handler, written, edge, afterCommit } = scene();

    await expect(
      handler.execute(
        new UpdateDeliveryPricingCommand({ b2b: { freeDeliveryThresholdCents: -1 } }, "staff_a"),
      ),
    ).rejects.toBeInstanceOf(InvalidFreeDeliveryThresholdError);
    await afterCommit.commit();

    expect(written.last).toBeNull();
    expect(edge.purges).toBe(0);
  });
});

describe("GetDeliveryPricingHandler", () => {
  it("rend le réglage tel que le port le lit", async () => {
    await expect(
      new GetDeliveryPricingHandler(new Current(DEFAULT_DELIVERY_PRICING)).execute(),
    ).resolves.toEqual(DEFAULT_DELIVERY_PRICING);
  });
});
