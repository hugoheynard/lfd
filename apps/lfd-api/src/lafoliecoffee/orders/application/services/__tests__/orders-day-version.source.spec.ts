import { OrderDayVersionReader } from "../../../domain/ports/order-day-version.reader.js";
import { OrdersDayVersionSource } from "../orders-day-version.source.js";

class TableVersions extends OrderDayVersionReader {
  constructor(private readonly versions: ReadonlyMap<string, number>) {
    super();
  }
  versionOf(day: string): Promise<number> {
    return Promise.resolve(this.versions.get(day) ?? 0);
  }
}

// Les dates ne sont comparées qu'entre elles : aucune horloge n'est lue.
describe("OrdersDayVersionSource", () => {
  it("rend la version du journal du commerce pour le jour demandé, zéro s'il n'en a pas", async () => {
    const source = new OrdersDayVersionSource(new TableVersions(new Map([["2026-10-03", 7]])));

    await expect(source.versionOf("2026-10-03")).resolves.toBe(7);
    await expect(source.versionOf("2026-10-04")).resolves.toBe(0);
  });

  it("se nomme `orders` et s'ouvre aux trois droits de ses anciennes portes", () => {
    const source = new OrdersDayVersionSource(new TableVersions(new Map()));

    expect(source.journal).toBe("orders");
    expect([...source.readers].sort()).toEqual([
      "b2b_orders:read",
      "b2b_supervision:read",
      "handover_counter:read",
    ]);
  });
});
