import {
  publicPickupSlotsFor,
  type PublicPickupClosureView,
  type PublicPickupSlot,
  type PublicPickupSlotRuleView,
} from "../public-pickup-slots.js";

/**
 * Les créneaux publics d'une journée — plan
 * `documentation/order/plan-creneaux-de-retrait.md`, D2 à D4.
 *
 * ⚠️ Les jours et instants de ces fixtures sont ABSOLUS, et c'est l'exception
 * étroite de `CLAUDE.md` §5 : ils ne sont jamais comparés à l'horloge du
 * système, seulement **entre eux** — `now` est injecté. Le sujet du dernier cas
 * EST le calendrier (la bascule d'heure d'été), qu'une date relative ne saurait
 * pas viser.
 */

/** Un instant très antérieur aux journées testées : rien n'est « déjà passé ». */
const BEFORE_EVERYTHING = new Date("2020-01-01T00:00:00.000Z");

/** Un vendredi ordinaire, hors de toute bascule de fuseau. */
const FRIDAY = "2027-05-14";

function rule(overrides: Partial<PublicPickupSlotRuleView> = {}): PublicPickupSlotRuleView {
  return {
    id: "ppslot_1",
    weekday: null,
    startTime: "07:00",
    endTime: "09:00",
    slotMinutes: 30,
    badge: null,
    serviceCapacity: null,
    ...overrides,
  };
}

function closure(overrides: Partial<PublicPickupClosureView> = {}): PublicPickupClosureView {
  return {
    id: "ppclose_1",
    fromDay: FRIDAY,
    toDay: FRIDAY,
    startTime: null,
    endTime: null,
    reason: "Congés",
    ...overrides,
  };
}

function times(slots: readonly PublicPickupSlot[]): string[] {
  return slots.map((slot) => slot.time);
}

describe("publicPickupSlotsFor — la découpe", () => {
  it("découpe la plage au pas de la règle", () => {
    const slots = publicPickupSlotsFor(FRIDAY, [rule()], [], [], BEFORE_EVERYTHING);

    expect(times(slots)).toEqual(["07:00", "07:30", "08:00", "08:30"]);
  });

  /**
   * Un pas qui ne divise pas la plage laisse le reste INUTILISÉ : offrir un
   * dernier créneau qui déborde la fermeture enverrait quelqu'un devant une
   * porte close.
   */
  it("un pas qui ne divise pas la plage n'invente pas de créneau qui déborde", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [rule({ startTime: "07:00", endTime: "08:00", slotMinutes: 25 })],
      [],
      [],
      BEFORE_EVERYTHING,
    );

    expect(times(slots)).toEqual(["07:00", "07:25"]);
  });

  it("ne garde que les règles du jour visé ; `weekday` nul vaut tous les jours", () => {
    const friday = publicPickupSlotsFor(
      FRIDAY,
      [
        rule({ id: "ppslot_fri", weekday: "fri", startTime: "07:00", endTime: "07:30" }),
        rule({ id: "ppslot_mon", weekday: "mon", startTime: "10:00", endTime: "10:30" }),
        rule({ id: "ppslot_all", weekday: null, startTime: "18:00", endTime: "18:30" }),
      ],
      [],
      [],
      BEFORE_EVERYTHING,
    );

    expect(times(friday)).toEqual(["07:00", "18:00"]);
  });

  it("porte le badge de SA règle sur chaque créneau", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [
        rule({ id: "a", startTime: "07:00", endTime: "07:30", badge: "Sortie du four" }),
        rule({ id: "b", startTime: "08:00", endTime: "08:30", badge: null }),
      ],
      [],
      [],
      BEFORE_EVERYTHING,
    );

    expect(slots.map((slot) => slot.badge)).toEqual(["Sortie du four", null]);
  });

  it("n'offre plus un créneau déjà commencé", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [rule()],
      [],
      [],
      // 07:45 locales (UTC+2 en mai) : les deux premiers créneaux sont passés.
      new Date("2027-05-14T05:45:00.000Z"),
    );

    expect(times(slots)).toEqual(["08:00", "08:30"]);
  });
});

describe("publicPickupSlotsFor — une fermeture prime (D4)", () => {
  it("une fermeture sans bornes vide la journée, règles comprises", () => {
    const slots = publicPickupSlotsFor(FRIDAY, [rule()], [closure()], [], BEFORE_EVERYTHING);

    expect(slots).toEqual([]);
  });

  it("une fermeture bornée retire ses créneaux, et ne décale pas la grille", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [rule()],
      [closure({ startTime: "07:30", endTime: "08:00" })],
      [],
      BEFORE_EVERYTHING,
    );

    // La grille reste celle de la règle : 08:00 et 08:30, pas 08:00 et 08:30
    // recalés sur la réouverture.
    expect(times(slots)).toEqual(["07:00", "08:00", "08:30"]);
  });

  /**
   * Une fermeture qui entame un créneau l'emporte en entier : servir la moitié
   * d'un quart d'heure fermé enverrait quelqu'un devant une porte close.
   */
  it("une fermeture qui commence au milieu d'un créneau emporte ce créneau", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [rule()],
      [closure({ startTime: "07:20", endTime: "08:10" })],
      [],
      BEFORE_EVERYTHING,
    );

    expect(times(slots)).toEqual(["08:30"]);
  });

  it("une fermeture d'un intervalle couvre chacun de ses jours", () => {
    const week = closure({ fromDay: "2027-05-10", toDay: "2027-05-20" });

    expect(publicPickupSlotsFor(FRIDAY, [rule()], [week], [], BEFORE_EVERYTHING)).toEqual([]);
    expect(
      times(publicPickupSlotsFor("2027-05-21", [rule()], [week], [], BEFORE_EVERYTHING)),
    ).toHaveLength(4);
  });
});

describe("publicPickupSlotsFor — la capacité de service (D3)", () => {
  it("sans capacité, un créneau ne refuse personne quel que soit le nombre de pris", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [rule({ serviceCapacity: null })],
      [],
      [{ time: "07:00", count: 99 }],
      BEFORE_EVERYTHING,
    );

    expect(slots[0]).toMatchObject({ time: "07:00", open: true, taken: 99, nextOpenTime: null });
  });

  /**
   * 🔴 La propriété que ce lot existe pour tenir : une capacité atteinte FERME
   * une heure et en propose une autre. Jamais un créneau absent, jamais un refus
   * sec — « complet, il reste de la place à 07:30 ».
   */
  it("une capacité atteinte rend le créneau VISIBLE et fermé, avec la suivante encore ouverte", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [rule({ serviceCapacity: 2 })],
      [],
      [
        { time: "07:00", count: 2 },
        { time: "07:30", count: 2 },
      ],
      BEFORE_EVERYTHING,
    );

    expect(times(slots)).toEqual(["07:00", "07:30", "08:00", "08:30"]);
    expect(slots[0]).toMatchObject({ open: false, taken: 2, nextOpenTime: "08:00" });
    expect(slots[1]).toMatchObject({ open: false, nextOpenTime: "08:00" });
    expect(slots[2]).toMatchObject({ open: true, nextOpenTime: null });
  });

  it("le dernier créneau plein n'a plus de suivante à proposer", () => {
    const slots = publicPickupSlotsFor(
      FRIDAY,
      [rule({ startTime: "07:00", endTime: "08:00", serviceCapacity: 1 })],
      [],
      [{ time: "07:30", count: 1 }],
      BEFORE_EVERYTHING,
    );

    expect(slots[1]).toMatchObject({ time: "07:30", open: false, nextOpenTime: null });
  });
});

describe("publicPickupSlotsFor — les bascules de fuseau", () => {
  /**
   * Le 28 mars 2027, 02:00 devient 03:00 à Paris : 02:00 et 02:30 n'existent
   * pas. `localToInstant` rend `null` plutôt qu'un instant décalé en silence, et
   * on saute le créneau — comme le fait `slotsFor` pour les rendez-vous.
   */
  it("saute les heures locales qui n'existent pas (passage à l'heure d'été)", () => {
    const slots = publicPickupSlotsFor(
      "2027-03-28",
      [rule({ startTime: "01:30", endTime: "03:30", slotMinutes: 30 })],
      [],
      [],
      BEFORE_EVERYTHING,
    );

    expect(times(slots)).toEqual(["01:30", "03:00"]);
    expect(slots[0]?.startAt).toBe("2027-03-28T00:30:00.000Z");
    expect(slots[1]?.startAt).toBe("2027-03-28T01:00:00.000Z");
  });
});
