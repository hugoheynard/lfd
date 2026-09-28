import { ProductionDayVersionReader } from "../../../domain/ports/production-day-version.reader.js";
import type { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { GetProductionDayVersionHandler } from "../get-production-day-version.handler.js";
import { GetProductionDayVersionQuery } from "../get-production-day-version.query.js";

class TableVersions extends ProductionDayVersionReader {
  readonly asked: string[] = [];
  constructor(private readonly versions: ReadonlyMap<string, number>) {
    super();
  }
  versionOf(day: ServiceDay): Promise<number> {
    this.asked.push(day.value);
    return Promise.resolve(this.versions.get(day.value) ?? 0);
  }
}

describe("GetProductionDayVersionHandler", () => {
  it("rend la version du journal pour la journée demandée", async () => {
    const versions = new TableVersions(new Map([["2026-10-03", 42]]));
    const handler = new GetProductionDayVersionHandler(versions);

    await expect(handler.execute(new GetProductionDayVersionQuery("2026-10-03"))).resolves.toEqual({
      date: "2026-10-03",
      version: 42,
    });
    expect(versions.asked).toEqual(["2026-10-03"]);
  });

  it("rend zéro pour une journée que rien n'a touchée", async () => {
    const handler = new GetProductionDayVersionHandler(new TableVersions(new Map()));
    await expect(handler.execute(new GetProductionDayVersionQuery("2026-10-04"))).resolves.toEqual({
      date: "2026-10-04",
      version: 0,
    });
  });

  it("refuse une journée mal formée sans interroger le journal", async () => {
    const versions = new TableVersions(new Map());
    const handler = new GetProductionDayVersionHandler(versions);
    await expect(handler.execute(new GetProductionDayVersionQuery("03/10/2026"))).rejects.toThrow();
    expect(versions.asked).toEqual([]);
  });
});
