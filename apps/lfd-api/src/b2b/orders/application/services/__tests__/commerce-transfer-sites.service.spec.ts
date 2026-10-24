import {
  type SiteArrivalOrder,
  SiteArrivalOrdersReader,
} from "../../../domain/ports/site-arrival-orders.reader.js";
import { CommerceTransferSites } from "../commerce-transfer-sites.service.js";
import {
  FOURNIL_GPS,
  siteDeadlinesOf,
  siteSettings,
  VILLAGE_GPS,
} from "./site-deadlines-doubles.js";

class FixedPickups extends SiteArrivalOrdersReader {
  constructor(private readonly orders: readonly SiteArrivalOrder[]) {
    super();
  }

  forDay(): Promise<readonly SiteArrivalOrder[]> {
    return Promise.resolve(this.orders);
  }
}

const VILLAGE_ORDER: SiteArrivalOrder = {
  siteId: "site_village",
  window: { start: "09:00", end: "10:00" },
};

function service(orders: readonly SiteArrivalOrder[]) {
  const sites = new Map([
    ["site_fournil", siteSettings({ gps: FOURNIL_GPS })],
    [
      "site_village",
      siteSettings({
        label: "Val Village",
        supply: "transfer",
        transferMode: "dedicated",
        gps: VILLAGE_GPS,
        counterSetupMinutes: 10,
        proPickup: { start: "07:30", end: "09:00" },
      }),
    ],
  ]);
  const { service: deadlines, sites: reader } = siteDeadlinesOf({ sites, travelMinutes: 25 });
  return new CommerceTransferSites(new FixedPickups(orders), reader, deadlines);
}

describe("CommerceTransferSites — de quoi placer le transfert d'un site (lot T1)", () => {
  it("rend nom, point, mode, et l'arrivée requise par la règle de l'échéance (T0)", async () => {
    const facts = await service([VILLAGE_ORDER]).sitesFor("2030-01-15", ["site_village"]);

    // Ouverture pros 07:30 − 10 minutes de mise en place.
    expect(facts.get("site_village")).toEqual({
      siteId: "site_village",
      label: "Val Village",
      gps: VILLAGE_GPS,
      mode: "dedicated",
      arrivalBy: "07:20",
    });
  });

  it("sans commande du site ce jour-là : pas d'heure, jamais une heure inventée", async () => {
    const facts = await service([]).sitesFor("2030-01-15", ["site_village"]);

    expect(facts.get("site_village")?.arrivalBy).toBeNull();
  });

  it("un site inconnu est absent", async () => {
    expect((await service([]).sitesFor("2030-01-15", ["site_x"])).size).toBe(0);
  });
});
