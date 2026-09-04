import {
  isPastOrderCutoff,
  orderCutoffInstant,
  resolveOrderCutoff,
  weekdayOfDate,
  type OrderCutoffView,
} from "../order-cutoff.js";

function rule(over: Partial<OrderCutoffView> = {}): OrderCutoffView {
  return {
    id: "c1",
    pickupAddressId: null,
    pickupLabel: null,
    weekday: null,
    daysBefore: 1,
    time: "18:00",
    ...over,
  };
}

describe("resolveOrderCutoff — la plus spécifique gagne", () => {
  const platformAllDays = rule({ id: "platform-all" });
  const platformSunday = rule({ id: "platform-sun", weekday: "sun" });
  const laboAllDays = rule({ id: "labo-all", pickupAddressId: "labo" });
  const laboSunday = rule({ id: "labo-sun", pickupAddressId: "labo", weekday: "sun" });

  const ALL = [platformAllDays, platformSunday, laboAllDays, laboSunday];

  it("le point + le jour précis passe avant tout", () => {
    expect(resolveOrderCutoff(ALL, "labo", "sun")?.id).toBe("labo-sun");
  });

  it("puis le point, tous jours", () => {
    expect(resolveOrderCutoff(ALL, "labo", "wed")?.id).toBe("labo-all");
  });

  it("puis le défaut plateforme du jour, pour un point sans règle propre", () => {
    expect(resolveOrderCutoff(ALL, "autre-labo", "sun")?.id).toBe("platform-sun");
  });

  it("puis le défaut plateforme tous jours", () => {
    expect(resolveOrderCutoff(ALL, "autre-labo", "wed")?.id).toBe("platform-all");
  });

  it("une livraison (aucun point) retombe sur le défaut plateforme", () => {
    expect(resolveOrderCutoff(ALL, null, "wed")?.id).toBe("platform-all");
  });

  it("aucune règle configurée ⇒ aucune limite, jamais un refus par défaut", () => {
    expect(resolveOrderCutoff([], "labo", "tue")).toBeNull();
  });

  it("des règles qui ne couvrent pas ce point et sans défaut ⇒ null", () => {
    expect(resolveOrderCutoff([laboAllDays], "autre-labo", "tue")).toBeNull();
  });

  it("l'ordre du tableau n'influe pas sur la priorité", () => {
    const shuffled = [platformAllDays, laboSunday, platformSunday, laboAllDays];

    expect(resolveOrderCutoff(shuffled, "labo", "sun")?.id).toBe("labo-sun");
  });
});

/**
 * Les assertions portent sur l'**instant absolu** (`toISOString`), jamais sur
 * `getHours()` / `getDate()` : ces getters-là lisent le fuseau du process, donc
 * ils passeraient sur un poste réglé sur Paris et nulle part ailleurs — la panne
 * même qu'on corrige. Le runner est en UTC (cf. `jest.config.cjs`).
 */
describe("orderCutoffInstant", () => {
  /**
   * **Régression : l'instant était construit dans le fuseau du PROCESS.**
   *
   * `new Date(y, m, d, h, min)` en conteneur UTC faisait valoir 18 h UTC à une
   * limite saisie à 18 h — soit 20 h à Paris l'été, 19 h l'hiver. Le décalage
   * changeait avec la saison, sur du code inchangé, et restait invisible tant
   * que rien n'appliquait la règle (corrigé le 2026-09-04).
   */
  it("interprète l'heure de la règle en heure de PARIS, pas en heure du process", () => {
    const summer = orderCutoffInstant(rule({ daysBefore: 1, time: "18:00" }), "2026-08-12");
    // 18 h à Paris en août = UTC+2.
    expect(summer?.toISOString()).toBe("2026-08-11T16:00:00.000Z");

    const winter = orderCutoffInstant(rule({ daysBefore: 1, time: "18:00" }), "2026-01-15");
    // La même heure de pendule, en janvier = UTC+1. Un décalage EN DUR serait faux.
    expect(winter?.toISOString()).toBe("2026-01-14T17:00:00.000Z");
  });

  it("compte les jours depuis l'ACHEMINEMENT, pas depuis le dépôt", () => {
    expect(
      orderCutoffInstant(rule({ daysBefore: 1, time: "18:00" }), "2026-08-12")?.toISOString(),
    ).toBe("2026-08-11T16:00:00.000Z");
  });

  it("`daysBefore: 0` = le jour même", () => {
    expect(
      orderCutoffInstant(rule({ daysBefore: 0, time: "06:30" }), "2026-08-12")?.toISOString(),
    ).toBe("2026-08-12T04:30:00.000Z");
  });

  it("franchit un changement de mois sans se tromper", () => {
    expect(
      orderCutoffInstant(rule({ daysBefore: 2, time: "18:00" }), "2026-09-01")?.toISOString(),
    ).toBe("2026-08-30T16:00:00.000Z");
  });

  /**
   * Le 2026-03-29, la pendule française saute de 02 h à 03 h : 02:30 n'existe
   * pas. On rend `null` plutôt qu'un instant décalé en silence — c'est
   * `isPastOrderCutoff` qui décide quoi en faire, et il choisit de ne pas
   * refuser.
   */
  it("rend null quand l'heure de la règle n'existe pas (passage à l'heure d'été)", () => {
    expect(orderCutoffInstant(rule({ daysBefore: 1, time: "02:30" }), "2026-03-30")).toBeNull();
  });
});

describe("weekdayOfDate", () => {
  /**
   * Régression du même bug, en plus discret : le jour venait de
   * `new Date(y, m, d).getDay()`, donc du fuseau du process. Une date nue n'a
   * pas de fuseau.
   */
  it("lit le jour d'une date nue sans passer par le fuseau du process", () => {
    expect(weekdayOfDate("2026-08-12")).toBe("wed");
    expect(weekdayOfDate("2026-01-01")).toBe("thu");
    expect(weekdayOfDate("2026-03-29")).toBe("sun");
  });
});

describe("isPastOrderCutoff", () => {
  const RULES = [rule({ id: "def", daysBefore: 1, time: "18:00" })];
  // Mercredi 12 août 2026, remise demandée. Limite : mardi 11 à 18 h Paris.
  const FULFILLMENT_DAY = "2026-08-12";

  it("laisse passer une minute avant la limite", () => {
    const now = new Date("2026-08-11T15:59:00.000Z"); // 17:59 à Paris
    expect(isPastOrderCutoff(RULES, null, FULFILLMENT_DAY, now)).toBe(false);
  });

  it("refuse une minute après la limite", () => {
    const now = new Date("2026-08-11T16:01:00.000Z"); // 18:01 à Paris
    expect(isPastOrderCutoff(RULES, null, FULFILLMENT_DAY, now)).toBe(true);
  });

  it("laisse passer PILE à l'heure — la limite est incluse", () => {
    const now = new Date("2026-08-11T16:00:00.000Z");
    expect(isPastOrderCutoff(RULES, null, FULFILLMENT_DAY, now)).toBe(false);
  });

  /**
   * Le défaut volontaire du contrat : une plateforme qui n'a rien configuré ne
   * refuse rien. Le comportement d'aujourd'hui, à l'identique.
   */
  it("ne refuse rien quand aucune règle ne couvre l'acheminement", () => {
    expect(isPastOrderCutoff([], null, FULFILLMENT_DAY, new Date("2030-01-01T00:00:00.000Z"))).toBe(
      false,
    );
  });

  it("ne refuse rien quand l'heure de la règle n'existe pas ce jour-là", () => {
    const gap = [rule({ daysBefore: 1, time: "02:30" })];
    expect(isPastOrderCutoff(gap, null, "2026-03-30", new Date("2030-01-01T00:00:00.000Z"))).toBe(
      false,
    );
  });

  it("prend la règle du POINT quand il y en a une", () => {
    const rules = [
      rule({ id: "labo", pickupAddressId: "labo", daysBefore: 2, time: "12:00" }),
      rule({ id: "def", daysBefore: 1, time: "18:00" }),
    ];
    // Limite du labo : lundi 10 à 12 h Paris (10 h UTC). Le défaut dirait mardi 18 h.
    const now = new Date("2026-08-10T10:30:00.000Z");
    expect(isPastOrderCutoff(rules, "labo", FULFILLMENT_DAY, now)).toBe(true);
    expect(isPastOrderCutoff(rules, null, FULFILLMENT_DAY, now)).toBe(false);
  });
});
