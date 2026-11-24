import { CommerceResupplyArrivals } from "../commerce-resupply-arrivals.service.js";
import { siteDeadlinesOf, siteSettings, VILLAGE_GPS } from "./site-deadlines-doubles.js";

const DAY = "2030-01-15";

function subject() {
  const sites = new Map([
    [
      "site_village",
      siteSettings({
        supply: "transfer",
        gps: VILLAGE_GPS,
        counterSetupMinutes: 10,
        proPickup: { start: "07:30", end: "09:00" },
      }),
    ],
    [
      "site_labo",
      siteSettings({
        supply: "on_site",
        counterSetupMinutes: 20,
        publicRules: [{ start: "08:00", end: "12:00", slotMinutes: 30 }],
      }),
    ],
    ["site_mute", siteSettings({ supply: "transfer", gps: VILLAGE_GPS })],
  ]);
  return siteDeadlinesOf({ sites, travelMinutes: null });
}

describe("SiteDeadlines.requiredArrivals — l'heure qu'un point demande, sans commande (H-D3)", () => {
  it("résout un point servi par transfert sans aucun retrait, même sans trajet connu", async () => {
    const { service, road } = subject();

    const arrivals = await service.requiredArrivals(DAY, ["site_village"]);

    // Ouverture pros 07:30 − 10 minutes de mise en place.
    expect(arrivals.get("site_village")).toBe("07:20");
    expect(road.asked).toEqual([]);
  });

  it("résout un point servi sur place par sa mise en place", async () => {
    const { service } = subject();

    expect((await service.requiredArrivals(DAY, ["site_labo"])).get("site_labo")).toBe("07:40");
  });

  it("un point sans horaire ou inconnu est absent, et rien n'est lu pour aucun point", async () => {
    const { service, sites } = subject();

    const arrivals = await service.requiredArrivals(DAY, ["site_mute", "site_ghost"]);

    expect([...arrivals.keys()]).toEqual([]);
    expect(await service.requiredArrivals(DAY, [])).toEqual(new Map());
    expect(sites.asked).toEqual([{ day: DAY, ids: ["site_mute", "site_ghost"] }]);
  });

  it("le port du réassort répond par la même règle", async () => {
    const { service } = subject();

    const arrivals = await new CommerceResupplyArrivals(service).requiredArrivals(DAY, [
      "site_village",
      "site_labo",
    ]);

    expect(Object.fromEntries(arrivals)).toEqual({ site_village: "07:20", site_labo: "07:40" });
  });
});
