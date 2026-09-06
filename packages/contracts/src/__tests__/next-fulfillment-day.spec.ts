import { nextFulfillmentDay, type OrderCutoffView } from "../order-cutoff.js";

/** Limite : la veille à 18 h, heure de Paris. Aucun rattrapage. */
const VEILLE_18H: OrderCutoffView = {
  id: "platform-all",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 0,
};

/** Le mardi 8 septembre 2026 à l'heure de Paris (été = UTC+2). */
const paris = (isoUtc: string): Date => new Date(isoUtc);

/**
 * 🔴 **L'écran posait « demain » sur l'horloge du navigateur du client**, sans
 * jamais regarder l'heure limite. La journée proposée pouvait donc être une
 * journée que la commande allait refuser — et personne ne l'annonçait.
 */
describe("nextFulfillmentDay — la journée qu’on peut encore demander", () => {
  it("propose DEMAIN tant que la limite de la veille n’est pas passée", () => {
    // 8 septembre, 17 h à Paris : la limite pour le 9 tombe ce soir à 18 h.
    expect(nextFulfillmentDay([VEILLE_18H], null, paris("2026-09-08T15:00:00Z"))).toBe(
      "2026-09-09",
    );
  });

  it("passe au SURLENDEMAIN une fois la limite tombée", () => {
    // 8 septembre, 18 h 01 à Paris : le 9 est fermé, le 10 reste ouvert.
    expect(nextFulfillmentDay([VEILLE_18H], null, paris("2026-09-08T16:01:00Z"))).toBe(
      "2026-09-10",
    );
  });

  /** Aucune règle ⇒ rien à opposer : la journée du jour est demandable. */
  it("rend AUJOURD’HUI quand aucune règle n’est posée", () => {
    expect(nextFulfillmentDay([], null, paris("2026-09-08T15:00:00Z"))).toBe("2026-09-08");
  });

  /** La règle du POINT gagne sur le défaut, comme partout ailleurs. */
  it("suit la règle du point de retrait quand il en a une", () => {
    const laboTroisJours: OrderCutoffView = {
      ...VEILLE_18H,
      id: "labo",
      pickupAddressId: "labo",
      daysBefore: 3,
    };

    expect(
      nextFulfillmentDay([laboTroisJours, VEILLE_18H], "labo", paris("2026-09-08T15:00:00Z")),
    ).toBe("2026-09-11");
  });

  /**
   * Aucune journée dans l'horizon ⇒ `null`, et pas un défaut. Retomber sur
   * « demain » réintroduirait exactement ce qu'on vient de retirer.
   */
  it("rend null plutôt qu’une journée de repli", () => {
    const impossible: OrderCutoffView = { ...VEILLE_18H, daysBefore: 14 };

    expect(nextFulfillmentDay([impossible], null, paris("2026-09-08T15:00:00Z"), 3)).toBeNull();
  });
});
