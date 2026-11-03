import { PackingDayVersionReader } from "../../../channels/packing/packing-day-version.reader.js";
import { ProductionDayVersionReader } from "../../../domain/ports/production-day-version.reader.js";
import type { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { ProductionDayVersionSource } from "../production-day-version.source.js";

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

// Les dates ne sont comparées qu'entre elles : aucune horloge n'est lue.
describe("ProductionDayVersionSource", () => {
  it("rend la version du journal pour la journée demandée", async () => {
    const versions = new TableVersions(new Map([["2026-10-03", 42]]));
    const source = new ProductionDayVersionSource(versions, new PackingVersions());

    await expect(source.versionOf("2026-10-03")).resolves.toBe(42);
    expect(versions.asked).toEqual(["2026-10-03"]);
  });

  it("rend zéro pour une journée que rien n'a touchée", async () => {
    const source = new ProductionDayVersionSource(
      new TableVersions(new Map()),
      new PackingVersions(),
    );
    await expect(source.versionOf("2026-10-04")).resolves.toBe(0);
  });

  it("refuse une journée mal formée sans interroger le journal", async () => {
    const versions = new TableVersions(new Map());
    const source = new ProductionDayVersionSource(versions, new PackingVersions());
    await expect(source.versionOf("03/10/2026")).rejects.toThrow();
    expect(versions.asked).toEqual([]);
  });

  it("additionne le journal du COLISAGE : un geste d'une journée `packing` fait changer la version (K2)", async () => {
    const day = "2026-10-03";
    const before = new ProductionDayVersionSource(
      new TableVersions(new Map([[day, 42]])),
      new PackingVersions(new Map([[day, 7]])),
    );
    const after = new ProductionDayVersionSource(
      new TableVersions(new Map([[day, 42]])),
      new PackingVersions(new Map([[day, 8]])),
    );

    const [seen, next] = await Promise.all([before.versionOf(day), after.versionOf(day)]);
    expect(seen).toBe(49);
    expect(next).not.toBe(seen);
  });

  it("se nomme `production` et s'ouvre aux gestes du fournil, du retrait et à la Supervision", () => {
    const source = new ProductionDayVersionSource(
      new TableVersions(new Map()),
      new PackingVersions(),
    );

    expect(source.journal).toBe("production");
    expect([...source.readers].sort()).toEqual([
      "b2b_supervision:read",
      "handover_counter:read",
      "production_packing:read",
      "production_plan:read",
      "production_worksheet:read",
    ]);
  });
});
