import { orderCutoffInstant, resolveOrderCutoff, type OrderCutoffView } from "../order-cutoff.js";

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

describe("orderCutoffInstant", () => {
  it("compte les jours depuis l'ACHEMINEMENT, pas depuis le dépôt", () => {
    const instant = orderCutoffInstant(rule({ daysBefore: 1, time: "18:00" }), "2026-08-12");

    expect(instant.getFullYear()).toBe(2026);
    expect(instant.getMonth()).toBe(7); // août
    expect(instant.getDate()).toBe(11);
    expect(instant.getHours()).toBe(18);
    expect(instant.getMinutes()).toBe(0);
  });

  it("`daysBefore: 0` = le jour même", () => {
    expect(orderCutoffInstant(rule({ daysBefore: 0, time: "06:30" }), "2026-08-12").getDate()).toBe(
      12,
    );
  });

  it("franchit un changement de mois sans se tromper", () => {
    const instant = orderCutoffInstant(rule({ daysBefore: 2, time: "18:00" }), "2026-09-01");

    expect(instant.getMonth()).toBe(7); // août
    expect(instant.getDate()).toBe(30);
  });

  it("est une heure LOCALE — celle du four, pas UTC", () => {
    // Construite via le constructeur local : l'heure lue est celle écrite.
    expect(orderCutoffInstant(rule({ time: "04:15" }), "2026-08-12").getHours()).toBe(4);
  });
});
