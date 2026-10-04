import { PackingDayVersionReader } from "../../../channels/packing/packing-day-version.reader.js";
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

/** Le journal du colisage (K2) : une version par journée, zéro par défaut. */
class PackingVersions extends PackingDayVersionReader {
  constructor(private readonly versions: ReadonlyMap<string, number> = new Map()) {
    super();
  }
  versionOf(serviceDay: string): Promise<number> {
    return Promise.resolve(this.versions.get(serviceDay) ?? 0);
  }
}

describe("GetProductionDayVersionHandler", () => {
  it("rend la version du journal pour la journée demandée", async () => {
    const versions = new TableVersions(new Map([["2026-10-03", 42]]));
    const handler = new GetProductionDayVersionHandler(versions, new PackingVersions());

    await expect(handler.execute(new GetProductionDayVersionQuery("2026-10-03"))).resolves.toEqual({
      date: "2026-10-03",
      version: 42,
    });
    expect(versions.asked).toEqual(["2026-10-03"]);
  });

  it("rend zéro pour une journée que rien n'a touchée", async () => {
    const handler = new GetProductionDayVersionHandler(
      new TableVersions(new Map()),
      new PackingVersions(),
    );
    await expect(handler.execute(new GetProductionDayVersionQuery("2026-10-04"))).resolves.toEqual({
      date: "2026-10-04",
      version: 0,
    });
  });

  it("refuse une journée mal formée sans interroger le journal", async () => {
    const versions = new TableVersions(new Map());
    const handler = new GetProductionDayVersionHandler(versions, new PackingVersions());
    await expect(handler.execute(new GetProductionDayVersionQuery("03/10/2026"))).rejects.toThrow();
    expect(versions.asked).toEqual([]);
  });

  it("additionne le journal du COLISAGE : un geste d'une journée `packing` fait changer la version (K2)", async () => {
    const day = "2026-10-03";
    const before = new GetProductionDayVersionHandler(
      new TableVersions(new Map([[day, 42]])),
      new PackingVersions(new Map([[day, 7]])),
    );
    const after = new GetProductionDayVersionHandler(
      new TableVersions(new Map([[day, 42]])),
      new PackingVersions(new Map([[day, 8]])),
    );

    const [seen, next] = await Promise.all([
      before.execute(new GetProductionDayVersionQuery(day)),
      after.execute(new GetProductionDayVersionQuery(day)),
    ]);
    expect(seen.version).toBe(49);
    expect(next.version).not.toBe(seen.version);
  });
});
