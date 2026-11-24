import type { SitedOrder } from "../site-deadlines.service.js";
import {
  FOURNIL_GPS,
  siteDeadlinesOf,
  siteSettings,
  VILLAGE_GPS,
} from "./site-deadlines-doubles.js";

const DAY = "2030-01-15";

const pickup = (siteId: string | null, start = "08:00"): SitedOrder => ({
  fulfillmentMethod: "pickup",
  window: { start, end: "10:00" },
  siteId,
});

const FOURNIL = siteSettings({ gps: FOURNIL_GPS });
const village = (over: Parameters<typeof siteSettings>[0] = {}) =>
  siteSettings({
    supply: "transfer",
    gps: VILLAGE_GPS,
    counterSetupMinutes: 10,
    proPickup: { start: "07:30", end: "09:00" },
    ...over,
  });

describe("SiteDeadlines — le site résolu de chaque retrait (T0)", () => {
  it("ne lit rien quand aucun retrait ne porte de site (livraisons, commandes d'avant S2)", async () => {
    const { service, sites } = siteDeadlinesOf({});

    const resolved = await service.forDay(DAY, [
      pickup(null),
      { fulfillmentMethod: "delivery", window: null, siteId: null },
    ]);

    expect(resolved.size).toBe(0);
    expect(sites.asked).toEqual([]);
  });

  it("un site sur place rend sa mise en place, sans trajet", async () => {
    const { service, road } = siteDeadlinesOf({
      sites: new Map([["site_labo", siteSettings({ counterSetupMinutes: 15 })]]),
    });

    const resolved = await service.forDay(DAY, [pickup("site_labo")]);

    expect(resolved.get("site_labo")).toEqual({ supply: "on_site", counterSetupMinutes: 15 });
    expect(road.asked).toEqual([]);
  });

  it("un site servi par transfert : départ et arrivée requis, trajet du départ des tournées au site", async () => {
    const { service, road, sites } = siteDeadlinesOf({
      sites: new Map([
        ["site_fournil", FOURNIL],
        ["site_village", village()],
      ]),
      travelMinutes: 25,
    });

    const resolved = await service.forDay(DAY, [pickup("site_village"), pickup("site_village")]);

    expect(resolved.get("site_village")).toEqual({
      supply: "transfer",
      requiredBy: "06:55",
      arrivalBy: "07:20",
    });
    expect(road.asked).toEqual([{ from: FOURNIL_GPS, to: VILLAGE_GPS }]);
    // Une seule lecture des sites, le départ des tournées compris.
    expect(sites.asked).toEqual([{ day: DAY, ids: ["site_village", "site_fournil"] }]);
  });

  it("part du premier créneau public ouvert quand il précède l'ouverture pros", async () => {
    const { service } = siteDeadlinesOf({
      sites: new Map([
        ["site_fournil", FOURNIL],
        [
          "site_village",
          village({
            publicRules: [{ start: "07:00", end: "09:00", slotMinutes: 30 }],
            publicClosures: [{ start: "07:00", end: "07:30" }],
          }),
        ],
      ]),
      travelMinutes: 25,
    });

    const resolved = await service.forDay(DAY, [pickup("site_village")]);

    // 07:00 fermé, 07:30 ouvert ; ouverture pros 07:30 : référence 07:30.
    expect(resolved.get("site_village")).toMatchObject({ arrivalBy: "07:20" });
  });

  it("sans créneau ni ouverture pros, part de la plus tôt des commandes du site", async () => {
    const { service } = siteDeadlinesOf({
      sites: new Map([
        ["site_fournil", FOURNIL],
        ["site_village", village({ proPickup: null })],
      ]),
      travelMinutes: 25,
    });

    const resolved = await service.forDay(DAY, [
      pickup("site_village", "09:00"),
      pickup("site_village", "08:30"),
      pickup("site_autre", "06:00"),
    ]);

    expect(resolved.get("site_village")).toMatchObject({ arrivalBy: "08:20" });
  });

  it.each([
    ["le site n'a pas de point GPS", { site: village({ gps: null }), departure: "site_fournil" }],
    ["aucun départ des tournées", { site: village(), departure: null }],
  ])(
    "%s : départ incalculable, arrivée gardée, aucune route demandée",
    async (_case, { site, departure }) => {
      const { service, road } = siteDeadlinesOf({
        sites: new Map([
          ["site_fournil", FOURNIL],
          ["site_village", site],
        ]),
        departureId: departure,
      });

      const resolved = await service.forDay(DAY, [pickup("site_village")]);

      // L'arrivée ne dépend pas du trajet : 07:30 − 10 minutes de mise en place.
      expect(resolved.get("site_village")).toEqual({
        supply: "transfer",
        requiredBy: null,
        arrivalBy: "07:20",
      });
      expect(road.asked).toEqual([]);
    },
  );

  /**
   * Régression : un calcul routier muet effaçait aussi l'arrivée, et la copie
   * du colisage comme le placement perdaient leur heure.
   */
  it("calcul routier indisponible : départ incalculable, jamais un trajet nul, arrivée gardée", async () => {
    const { service } = siteDeadlinesOf({
      sites: new Map([
        ["site_fournil", FOURNIL],
        ["site_village", village()],
      ]),
      travelMinutes: null,
    });

    const resolved = await service.forDay(DAY, [pickup("site_village")]);

    expect(resolved.get("site_village")).toMatchObject({ requiredBy: null, arrivalBy: "07:20" });
  });

  it("un site inconnu reste non résolu : l'ancien calcul, pas un défaut", async () => {
    const { service } = siteDeadlinesOf({ sites: new Map([["site_fournil", FOURNIL]]) });

    const resolved = await service.forDay(DAY, [pickup("site_disparu")]);

    expect(resolved.has("site_disparu")).toBe(false);
  });
});

describe("SiteDeadlines — la plus faible échéance, réassorts compris (H3b)", () => {
  const SITES = new Map([
    ["site_fournil", FOURNIL],
    ["site_village", village()],
  ]);

  /**
   * Régression : un réassort à 05:30 avançait la camionnette, pas l'échéance
   * des commandes du point, qui restaient comptées sur l'ouverture.
   */
  it("un réassort à 05:30 avance l'échéance des commandes du point", async () => {
    const { service } = siteDeadlinesOf({
      sites: SITES,
      travelMinutes: 25,
      resupplies: new Map([["site_village", "05:30"]]),
    });

    const resolved = await service.forDay(DAY, [pickup("site_village")]);

    expect(resolved.get("site_village")).toEqual({
      supply: "transfer",
      requiredBy: "05:05",
      arrivalBy: "05:30",
    });
  });

  it("un réassort à 13:00 ne retarde rien : l'ouverture reste un plancher", async () => {
    const { service } = siteDeadlinesOf({
      sites: SITES,
      travelMinutes: 25,
      resupplies: new Map([["site_village", "13:00"]]),
    });

    const resolved = await service.forDay(DAY, [pickup("site_village")]);

    expect(resolved.get("site_village")).toMatchObject({ requiredBy: "06:55", arrivalBy: "07:20" });
  });

  it("un point sans retrait n'est résolu que s'il est demandé ET a un réassort daté", async () => {
    const { service } = siteDeadlinesOf({
      sites: SITES,
      resupplies: new Map([["site_village", "06:00"]]),
    });

    expect((await service.forDay(DAY, [])).size).toBe(0);
    expect((await service.forDay(DAY, [], ["site_village"])).get("site_village")).toMatchObject({
      arrivalBy: "06:00",
    });
    expect((await service.forDay(DAY, [], ["site_fournil"])).size).toBe(0);
  });

  it("l'heure proposée au réassort reste celle du point, sans les réassorts", async () => {
    const { service } = siteDeadlinesOf({
      sites: SITES,
      resupplies: new Map([["site_village", "05:30"]]),
    });

    expect((await service.requiredArrivals(DAY, ["site_village"])).get("site_village")).toBe(
      "07:20",
    );
  });
});
