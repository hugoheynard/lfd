import {
  TimingWindowReader,
  type TimingSample,
} from "../../../platform/metrics/timing-window.reader.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { ReadPricingProbeHandler } from "../read-pricing-probe.handler.js";

/** La fenêtre doublée : des mesures fixes, et les noms qu'on lui a demandés. */
class FixedWindow extends TimingWindowReader {
  readonly windowMinutes = 30;
  readonly asked: string[] = [];

  constructor(private readonly samples: readonly TimingSample[]) {
    super();
  }

  read(name: string): readonly TimingSample[] {
    this.asked.push(name);
    return this.samples;
  }
}

// L'instant n'est comparé qu'à lui-même : il ne juge rien.
const NOW = new Date(1_755_600_000_000);

describe("ReadPricingProbeHandler", () => {
  it("lit la mesure `pricing.resolve` et la rend jugée, avec son seuil et sa fenêtre", async () => {
    const window = new FixedWindow([
      { labels: { caller: "checkout", audience: "pro" }, ms: 120, size: 8 },
    ]);
    const handler = new ReadPricingProbeHandler(window, new FixedClock(NOW));

    const report = await handler.execute();

    expect(window.asked).toEqual(["pricing.resolve"]);
    expect(report).toEqual({
      generatedAt: NOW.toISOString(),
      windowMinutes: 30,
      p95ThresholdMs: 300,
      perInstance: true,
      rows: [
        {
          caller: "checkout",
          audience: "pro",
          lots: 1,
          p50Ms: 120,
          p95Ms: 120,
          meanItems: 8,
          state: "ok",
        },
      ],
    });
  });

  it("rend une carte vide quand rien n'a été résolu sur la fenêtre", async () => {
    const report = await new ReadPricingProbeHandler(
      new FixedWindow([]),
      new FixedClock(NOW),
    ).execute();

    expect(report.rows).toEqual([]);
  });
});
