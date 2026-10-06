import { DELIVERY_CLIENTS } from "../delivery-clients.seed.js";
import { NEIGHBOURS } from "../neighbour-clients.seed.js";
import { TOMORROW_ROUNDS_CLIENTS } from "../tomorrow-rounds-clients.seed.js";
import { estimatedMannes, HOTEL_MANNES, MANNES_HOTEL } from "../tomorrow-rounds-houses.js";

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

  /**
   * Ce que portent les camionnettes semées, plafond de la caisse compris
   * (`planLoading`, mesuré le 2026-10-06) : 18 (145 cm, piles de deux), 9 et 9.
   */
  const TWO_BEST_VANS = 18 + 9;
  const THREE_VANS = 18 + 9 + 9;
  /** La livraison de l'Hôtel Le Lac Blanc, déjà posée pour demain : une manne par défaut. */
  const LAC_BLANC_MANNES = 1;

  it("demandent plus de mannes que deux camionnettes n'en portent, pas plus que trois", () => {
    const mannes =
      LAC_BLANC_MANNES +
      TOMORROW_ROUNDS_CLIENTS.reduce(
        (sum, client) => sum + (estimatedMannes(client.enseigne) ?? 1),
        0,
      );
    expect(estimatedMannes(MANNES_HOTEL)).toBe(HOTEL_MANNES);
    expect(mannes).toBeGreaterThan(TWO_BEST_VANS);
    expect(mannes).toBeLessThanOrEqual(THREE_VANS);
  });
});
