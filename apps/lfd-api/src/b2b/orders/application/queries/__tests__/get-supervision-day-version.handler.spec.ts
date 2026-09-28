import { OrderDayVersionReader } from "../../../domain/ports/order-day-version.reader.js";
import { GetSupervisionDayVersionHandler } from "../get-supervision-day-version.handler.js";
import { GetSupervisionDayVersionQuery } from "../get-supervision-day-version.query.js";

class TableVersions extends OrderDayVersionReader {
  constructor(private readonly versions: ReadonlyMap<string, number>) {
    super();
  }
  versionOf(day: string): Promise<number> {
    return Promise.resolve(this.versions.get(day) ?? 0);
  }
}

describe("GetSupervisionDayVersionHandler", () => {
  it("rend la version du journal du commerce pour le jour demandé, zéro s'il n'en a pas", async () => {
    const handler = new GetSupervisionDayVersionHandler(
      new TableVersions(new Map([["2026-10-03", 7]])),
    );

    await expect(handler.execute(new GetSupervisionDayVersionQuery("2026-10-03"))).resolves.toEqual(
      { date: "2026-10-03", version: 7 },
    );
    await expect(handler.execute(new GetSupervisionDayVersionQuery("2026-10-04"))).resolves.toEqual(
      { date: "2026-10-04", version: 0 },
    );
  });
});
