import {
  decideOrderCutoff,
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
    graceMinutes: 0,
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

describe("decideOrderCutoff — les trois états", () => {
  const RULES = [rule({ id: "def", daysBefore: 1, time: "18:00" })];
  // Mercredi 12 août 2026. Limite : mardi 11 à 18 h Paris, soit 16:00Z.
  const FULFILLMENT_DAY = "2026-08-12";
  const LIMIT = "2026-08-11T16:00:00.000Z";

  function at(instant: string, rules: readonly OrderCutoffView[] = RULES) {
    return decideOrderCutoff(rules, null, FULFILLMENT_DAY, new Date(instant));
  }

  it("est `open` une minute avant la limite", () => {
    expect(at("2026-08-11T15:59:00.000Z").status).toBe("open");
  });

  /**
   * **La borne est incluse**, et ce n'est pas un détail : une limite affichée
   * « 18 h » doit accepter 18 h 00 min 00 s. L'exclure ferait refuser quelqu'un
   * qui a lu l'écran et cliqué à l'heure dite.
   */
  it("est `open` PILE à la limite", () => {
    expect(at(LIMIT).status).toBe("open");
  });

  it("est `closed` juste après, quand aucune grâce n'est réglée", () => {
    expect(at("2026-08-11T16:00:01.000Z").status).toBe("closed");
  });

  describe("avec une grâce de 45 minutes", () => {
    const GRACIOUS = [rule({ id: "def", daysBefore: 1, time: "18:00", graceMinutes: 45 })];

    it("passe en `grace` après la limite, pas en `closed`", () => {
      expect(at("2026-08-11T16:01:00.000Z", GRACIOUS).status).toBe("grace");
    });

    it("reste `grace` PILE à la fin du rattrapage — l'autre borne est incluse aussi", () => {
      expect(at("2026-08-11T16:45:00.000Z", GRACIOUS).status).toBe("grace");
    });

    it("bascule `closed` une seconde après", () => {
      expect(at("2026-08-11T16:45:01.000Z", GRACIOUS).status).toBe("closed");
    });

    it("expose les deux instants, pour que l'écran puisse les dire", () => {
      const decision = at("2026-08-11T16:10:00.000Z", GRACIOUS);
      expect(decision.limit?.toISOString()).toBe(LIMIT);
      expect(decision.graceEnd?.toISOString()).toBe("2026-08-11T16:45:00.000Z");
      expect(decision.rule?.id).toBe("def");
    });
  });

  /**
   * `graceMinutes: 0` — le défaut de la colonne — referme le rattrapage sur la
   * limite. C'est ce qui rend la bascule invisible pour l'existant : aucune
   * ligne déjà en base ne se met à accepter quoi que ce soit de plus.
   */
  it("ne crée aucune fenêtre quand la grâce vaut 0", () => {
    const decision = at("2026-08-11T16:00:01.000Z");
    expect(decision.status).toBe("closed");
    expect(decision.graceEnd?.toISOString()).toBe(LIMIT);
  });

  /**
   * Le défaut volontaire du contrat : une plateforme qui n'a rien configuré ne
   * refuse rien. Le comportement d'aujourd'hui, à l'identique.
   */
  it("est `open` quand aucune règle ne couvre l'acheminement", () => {
    expect(at("2030-01-01T00:00:00.000Z", []).status).toBe("open");
  });

  it("est `open` quand l'heure de la règle n'existe pas ce jour-là", () => {
    const gap = [rule({ daysBefore: 1, time: "02:30", graceMinutes: 45 })];
    const decision = decideOrderCutoff(gap, null, "2026-03-30", new Date("2030-01-01T00:00:00Z"));
    expect(decision.status).toBe("open");
    // La règle est bien celle retenue : c'est l'INSTANT qui manque, pas la règle.
    expect(decision.rule?.time).toBe("02:30");
    expect(decision.limit).toBeNull();
  });

  it("prend la règle du POINT quand il y en a une", () => {
    const rules = [
      rule({ id: "labo", pickupAddressId: "labo", daysBefore: 2, time: "12:00" }),
      rule({ id: "def", daysBefore: 1, time: "18:00" }),
    ];
    // Limite du labo : lundi 10 à 12 h Paris (10:00Z). Le défaut dirait mardi 18 h.
    const now = new Date("2026-08-10T10:30:00.000Z");
    expect(decideOrderCutoff(rules, "labo", FULFILLMENT_DAY, now).status).toBe("closed");
    expect(decideOrderCutoff(rules, null, FULFILLMENT_DAY, now).status).toBe("open");
  });
});
