import { DELIVERY_CLIENTS } from "../delivery-clients.seed.js";
import { NEIGHBOURS } from "../neighbour-clients.seed.js";
import { TOMORROW_ROUNDS_CLIENTS } from "../tomorrow-rounds-clients.seed.js";
import { MANNES_HOTEL } from "../tomorrow-rounds-houses.js";

/** Les codes postaux que les zones semées desservent (`station.seed.ts`). */
const SERVED_POSTCODES = ["73150", "73320", "73700"];
const EARLY = "07:00";

describe("les maisons des tournées de demain", () => {
  const others = [...NEIGHBOURS, ...DELIVERY_CLIENTS];

  it("ne reprennent ni une raison sociale, ni un SIRET, ni un sujet déjà semés", () => {
    const keys = (pick: (client: (typeof others)[number]) => string) => {
      const all = [...others, ...TOMORROW_ROUNDS_CLIENTS].map(pick);
      return new Set(all).size === all.length;
    };
    expect(keys((client) => client.raisonSociale)).toBe(true);
    expect(keys((client) => client.siret)).toBe(true);
    expect(keys((client) => client.person.auth0Sub)).toBe(true);
  });

  it("sont toutes dans une zone desservie, en trois secteurs", () => {
    for (const client of TOMORROW_ROUNDS_CLIENTS) {
      expect(SERVED_POSTCODES).toContain(client.address.codePostal);
    }
    const sectors = new Set(TOMORROW_ROUNDS_CLIENTS.map((client) => client.address.codePostal));
    expect(sectors.size).toBe(3);
  });

  it("portent une échéance chacune, et chaque secteur en a une serrée (avant 7 h)", () => {
    for (const postcode of SERVED_POSTCODES) {
      const early = TOMORROW_ROUNDS_CLIENTS.filter(
        (client) =>
          client.address.codePostal === postcode &&
          client.site?.deadlines !== null &&
          (client.site?.deadlines?.[0] ?? "99:99") <= EARLY,
      );
      expect({ postcode, early: early.length > 0 }).toEqual({ postcode, early: true });
    }
  });

  it("comptent l'hôtel aux trois mannes", () => {
    expect(TOMORROW_ROUNDS_CLIENTS.map((client) => client.enseigne)).toContain(MANNES_HOTEL);
  });
});
