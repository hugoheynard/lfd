import { InvalidServiceDayError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryDayVersionReader } from "../../domain/ports/delivery-day-version.reader.js";
import { DeliveryDayVersionSource } from "../delivery-day-version.source.js";

class TableVersions extends DeliveryDayVersionReader {
  readonly asked: string[] = [];
  constructor(private readonly versions: ReadonlyMap<string, number>) {
    super();
  }
  versionOf(serviceDay: string): Promise<number> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.versions.get(serviceDay) ?? 0);
  }
}

// Les dates ne sont comparées qu'entre elles : aucune horloge n'est lue.
describe("DeliveryDayVersionSource", () => {
  it("rend la version du journal de la livraison pour la journée demandée", async () => {
    const versions = new TableVersions(new Map([["2026-10-03", 42]]));
    const source = new DeliveryDayVersionSource(versions);

    await expect(source.versionOf("2026-10-03")).resolves.toBe(42);
    expect(versions.asked).toEqual(["2026-10-03"]);
  });

  it("rend zéro pour une journée que rien n'a touchée", async () => {
    const source = new DeliveryDayVersionSource(new TableVersions(new Map()));
    await expect(source.versionOf("2026-10-04")).resolves.toBe(0);
  });

  it("refuse un jour absent du calendrier sans interroger le journal", async () => {
    const versions = new TableVersions(new Map());
    const source = new DeliveryDayVersionSource(versions);
    await expect(source.versionOf("2026-02-30")).rejects.toThrow(InvalidServiceDayError);
    expect(versions.asked).toEqual([]);
  });

  it("se nomme `delivery` et s'ouvre aux tournées comme au chargement", () => {
    const source = new DeliveryDayVersionSource(new TableVersions(new Map()));
    expect(source.journal).toBe("delivery");
    expect([...source.readers].sort()).toEqual(["delivery_loading:read", "delivery_rounds:read"]);
  });
});
