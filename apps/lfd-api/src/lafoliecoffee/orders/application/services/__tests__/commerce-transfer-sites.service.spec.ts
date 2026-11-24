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

function service(
  orders: readonly SiteArrivalOrder[],
  resupplies: ReadonlyMap<string, string> = new Map(),
  travelMinutes: number | null = 25,
) {
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
  const { service: deadlines, sites: reader } = siteDeadlinesOf({
    sites,
    travelMinutes,
    resupplies,
  });
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

describe("CommerceTransferSites — la plus tôt des heures de ce que le transfert porte (H2)", () => {
  /**
   * Régression : un point qui ne recevait que des réassorts n'avait pas
   * d'heure, et son transfert se plaçait sans fenêtre, après-midi compris.
   */
  it("un point à réassorts seuls a une fenêtre : celle que le point demande", async () => {
    const facts = await service([], new Map([["site_village", "08:00"]])).sitesFor("2030-01-15", [
      "site_village",
    ]);

    // Ouverture pros 07:30 − 10 minutes de mise en place, plus tôt que 08:00.
    expect(facts.get("site_village")?.arrivalBy).toBe("07:20");
  });

  it("un réassort à 05:30 avance le transfert", async () => {
    const facts = await service([VILLAGE_ORDER], new Map([["site_village", "05:30"]])).sitesFor(
      "2030-01-15",
      ["site_village"],
    );

    expect(facts.get("site_village")?.arrivalBy).toBe("05:30");
  });

  it("un réassort à 13:00 ne le retarde pas", async () => {
    const facts = await service([VILLAGE_ORDER], new Map([["site_village", "13:00"]])).sitesFor(
      "2030-01-15",
      ["site_village"],
    );

    expect(facts.get("site_village")?.arrivalBy).toBe("07:20");
  });

  it("un point à réassorts seuls sans horaire prend l'heure du réassort", async () => {
    const sites = new Map([
      ["site_fournil", siteSettings({ gps: FOURNIL_GPS })],
      ["site_chalet", siteSettings({ supply: "transfer", gps: VILLAGE_GPS })],
    ]);
    const { service: deadlines, sites: reader } = siteDeadlinesOf({
      sites,
      resupplies: new Map([["site_chalet", "06:30"]]),
    });
    const facts = await new CommerceTransferSites(new FixedPickups([]), reader, deadlines).sitesFor(
      "2030-01-15",
      ["site_chalet"],
    );

    expect(facts.get("site_chalet")?.arrivalBy).toBe("06:30");
  });

  it("un point servi sur place n'a jamais d'heure de transfert, réassort ou pas", async () => {
    const sites = new Map([["site_labo", siteSettings()]]);
    const { service: deadlines, sites: reader } = siteDeadlinesOf({
      sites,
      resupplies: new Map([["site_labo", "06:30"]]),
    });
    const facts = await new CommerceTransferSites(new FixedPickups([]), reader, deadlines).sitesFor(
      "2030-01-15",
      ["site_labo"],
    );

    expect(facts.get("site_labo")?.arrivalBy).toBeNull();
  });

  /**
   * Régression : un calcul routier muet effaçait le départ ET l'arrivée, et
   * le transfert se replaçait sans fenêtre.
   */
  it("un calcul routier muet garde l'heure d'arrivée", async () => {
    const facts = await service([VILLAGE_ORDER], new Map(), null).sitesFor("2030-01-15", [
      "site_village",
    ]);

    expect(facts.get("site_village")?.arrivalBy).toBe("07:20");
  });

  it("un point à réassorts seuls et calcul routier muet garde l'heure du réassort", async () => {
    const facts = await service([], new Map([["site_village", "06:00"]]), null).sitesFor(
      "2030-01-15",
      ["site_village"],
    );

    expect(facts.get("site_village")?.arrivalBy).toBe("06:00");
  });
});
