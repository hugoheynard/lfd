import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { MediaLibraryCensus } from "../../../platform/storage/media-library-census.js";
import { ReadMediaThresholdsHandler } from "../read-media-thresholds.handler.js";

/** Le fonds doublé : un compte fixe, et combien de fois on l'a demandé. */
class FixedCensus extends MediaLibraryCensus {
  calls = 0;

  constructor(private readonly images: number) {
    super();
  }

  countImages(): Promise<number> {
    this.calls += 1;
    return Promise.resolve(this.images);
  }
}

// L'instant n'est comparé qu'à lui-même : il ne juge rien.
const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("ReadMediaThresholdsHandler", () => {
  it("compte le fonds une fois et rend les trois seuils jugés", async () => {
    const census = new FixedCensus(1_100);
    const handler = new ReadMediaThresholdsHandler(census, new FixedClock(NOW));

    const report = await handler.execute();

    expect(census.calls).toBe(1);
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.images).toBe(1_100);
    expect(report.thresholds.map((threshold) => [threshold.key, threshold.state])).toEqual([
      ["transformations", "attention"],
      ["ranked-sort", "ok"],
      ["palette-strip", "ok"],
    ]);
  });

  it("laisse remonter un compte en échec : l'écran dit qu'il ne voit plus", async () => {
    class BrokenCensus extends MediaLibraryCensus {
      countImages(): Promise<number> {
        return Promise.reject(new TypeError("base injoignable"));
      }
    }
    const handler = new ReadMediaThresholdsHandler(new BrokenCensus(), new FixedClock(NOW));

    await expect(handler.execute()).rejects.toThrow("base injoignable");
  });
});
