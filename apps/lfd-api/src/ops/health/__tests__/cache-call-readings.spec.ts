import { cacheCallReports } from "../cache-call-readings.js";

const sample = (operation: string, outcome: string, ms: number) => ({
  labels: { operation, outcome },
  ms,
  size: 1,
});

describe("cacheCallReports — la durée des appels à l'objet des rayons (C5)", () => {
  it("rend par opération le nombre d'appels, d'abandons, le p50 et le p95", () => {
    const reads = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((ms) =>
      sample("read", ms === 100 ? "late" : "in_time", ms),
    );

    expect(cacheCallReports([...reads, sample("store", "in_time", 12)], [], 30)).toEqual([
      {
        store: "shelf_cache",
        operation: "read",
        calls: 10,
        late: 1,
        p50Ms: 50,
        p95Ms: 100,
        lateFinishP95Ms: null,
        windowMinutes: 30,
      },
      {
        store: "shelf_cache",
        operation: "store",
        calls: 1,
        late: 0,
        p50Ms: 12,
        p95Ms: 12,
        lateFinishP95Ms: null,
        windowMinutes: 30,
      },
    ]);
  });

  it("porte la durée finale des appels abandonnés, à côté de leur durée jusqu'à l'abandon", () => {
    const [report] = cacheCallReports(
      [sample("read", "late", 100)],
      [sample("read", "settled", 340)],
      30,
    );

    expect(report).toMatchObject({ p95Ms: 100, late: 1, lateFinishP95Ms: 340 });
  });

  it("sans appel, pas de ligne : un 0 ms se lirait comme un appel gratuit", () => {
    expect(cacheCallReports([], [sample("read", "settled", 340)], 30)).toEqual([]);
  });
});
