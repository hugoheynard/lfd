import type { DayJournal, StaffPermission } from "@lfd/contracts";

import { DayVersionRegistry } from "../day-version-registry.js";
import { DayVersionSource } from "../day-version-source.js";
import { GetDayVersionsHandler } from "../get-day-versions.handler.js";
import { GetDayVersionsQuery } from "../get-day-versions.query.js";

/** Une source qui rend une version fixe et retient les journées demandées. */
class RecordingSource extends DayVersionSource {
  readonly asked: string[] = [];
  constructor(
    readonly journal: DayJournal,
    readonly readers: readonly [StaffPermission, ...StaffPermission[]],
    private readonly version: number,
  ) {
    super();
  }
  versionOf(serviceDay: string): Promise<number> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.version);
  }
}

// Une journée comparée à rien : aucune horloge n'est lue.
const DAY = "2030-03-12";

function sources(): Record<DayJournal, RecordingSource> {
  return {
    orders: new RecordingSource("orders", ["b2b_orders:read", "handover_counter:read"], 7),
    production: new RecordingSource("production", ["production_plan:read"], 42),
    delivery: new RecordingSource("delivery", ["delivery_rounds:read"], 3),
    "my-round": new RecordingSource("my-round", ["delivery_driving:read"], 11),
  };
}

describe("GetDayVersionsHandler — la porte unique des versions de journée", () => {
  it("rend la version de chaque journal demandé et permis, en une réponse", async () => {
    const all = sources();
    const handler = new GetDayVersionsHandler(new DayVersionRegistry(Object.values(all)));

    const view = await handler.execute(
      new GetDayVersionsQuery(
        DAY,
        ["orders", "production"],
        ["b2b_orders:read", "production_plan:read"],
      ),
    );

    expect(view).toEqual({ date: DAY, versions: { orders: 7, production: 42 } });
    expect(all.delivery.asked).toEqual([]);
  });

  it("OMET un journal que l'appelant ne peut pas lire, sans refuser les autres — et ne l'interroge pas", async () => {
    const all = sources();
    const handler = new GetDayVersionsHandler(new DayVersionRegistry(Object.values(all)));

    const view = await handler.execute(
      new GetDayVersionsQuery(DAY, ["orders", "production"], ["handover_counter:read"]),
    );

    expect(view).toEqual({ date: DAY, versions: { orders: 7 } });
    expect(all.production.asked).toEqual([]);
  });

  it("rend une réponse vide à qui n'a aucun des droits, sans erreur", async () => {
    const handler = new GetDayVersionsHandler(new DayVersionRegistry(Object.values(sources())));

    await expect(
      handler.execute(new GetDayVersionsQuery(DAY, ["delivery", "my-round"], ["b2b_orders:read"])),
    ).resolves.toEqual({ date: DAY, versions: {} });
  });

  it("fait échouer la réponse entière quand une source échoue : le veilleur ne relit rien", async () => {
    class BrokenSource extends RecordingSource {
      override versionOf(): Promise<number> {
        return Promise.reject(new RangeError("journal injoignable"));
      }
    }
    const all = sources();
    const handler = new GetDayVersionsHandler(
      new DayVersionRegistry([
        all.orders,
        new BrokenSource("production", ["production_plan:read"], 0),
        all.delivery,
        all["my-round"],
      ]),
    );

    await expect(
      handler.execute(
        new GetDayVersionsQuery(
          DAY,
          ["orders", "production"],
          ["b2b_orders:read", "production_plan:read"],
        ),
      ),
    ).rejects.toThrow("journal injoignable");
  });
});
