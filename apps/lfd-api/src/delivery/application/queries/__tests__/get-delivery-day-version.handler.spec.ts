import { InvalidServiceDayError } from "../../../domain/errors/delivery-round-errors.js";
import { DeliveryDayVersionReader } from "../../../domain/ports/delivery-day-version.reader.js";
import { GetDeliveryDayVersionHandler } from "../get-delivery-day-version.handler.js";
import { GetDeliveryDayVersionQuery } from "../get-delivery-day-version.query.js";

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
describe("GetDeliveryDayVersionHandler", () => {
  it("rend la version du journal de la livraison pour la journée demandée", async () => {
    const versions = new TableVersions(new Map([["2026-10-03", 42]]));
    const handler = new GetDeliveryDayVersionHandler(versions);

    await expect(handler.execute(new GetDeliveryDayVersionQuery("2026-10-03"))).resolves.toEqual({
      date: "2026-10-03",
      version: 42,
    });
    expect(versions.asked).toEqual(["2026-10-03"]);
  });

  it("rend zéro pour une journée que rien n'a touchée", async () => {
    const handler = new GetDeliveryDayVersionHandler(new TableVersions(new Map()));
    await expect(handler.execute(new GetDeliveryDayVersionQuery("2026-10-04"))).resolves.toEqual({
      date: "2026-10-04",
      version: 0,
    });
  });

  it("refuse un jour absent du calendrier sans interroger le journal", async () => {
    const versions = new TableVersions(new Map());
    const handler = new GetDeliveryDayVersionHandler(versions);
    await expect(handler.execute(new GetDeliveryDayVersionQuery("2026-02-30"))).rejects.toThrow(
      InvalidServiceDayError,
    );
    expect(versions.asked).toEqual([]);
  });
});
