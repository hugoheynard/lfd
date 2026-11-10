import type { ProductAudienceCounterView } from "@lfd/contracts";

import { InvalidAudiencePeriodError } from "../../../domain/errors/recommendation-errors.js";
import { AudienceCounterReader } from "../../../domain/ports/audience-counter.reader.js";
import { ListProductAudienceCountersHandler } from "../list-product-audience-counters.handler.js";
import { ListProductAudienceCountersQuery } from "../list-product-audience-counters.query.js";

class StubCounters extends AudienceCounterReader {
  readonly asked: { from: string; to: string }[] = [];
  constructor(private readonly rows: readonly ProductAudienceCounterView[]) {
    super();
  }
  between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]> {
    this.asked.push({ from, to });
    return Promise.resolve(this.rows);
  }
}

describe("ListProductAudienceCountersHandler", () => {
  const row: ProductAudienceCounterView = {
    day: "2026-03-10",
    sku: "CRO",
    event: "product_viewed",
    placement: "none",
    source: "none",
    count: 3,
  };

  it("rend les compteurs de la période demandée", async () => {
    const counters = new StubCounters([row]);
    const handler = new ListProductAudienceCountersHandler(counters);

    await expect(
      handler.execute(new ListProductAudienceCountersQuery("2026-03-01", "2026-03-10")),
    ).resolves.toEqual([row]);
    expect(counters.asked).toEqual([{ from: "2026-03-01", to: "2026-03-10" }]);
  });

  it("refuse une période à l'envers sans lire", async () => {
    const counters = new StubCounters([]);
    const handler = new ListProductAudienceCountersHandler(counters);

    await expect(
      handler.execute(new ListProductAudienceCountersQuery("2026-03-10", "2026-03-01")),
    ).rejects.toThrow(InvalidAudiencePeriodError);
    expect(counters.asked).toEqual([]);
  });
});
