import type {
  AvailabilityExceptionView,
  AvailabilityRuleView,
  BookingPolicy,
} from "@lfd/contracts";

import {
  isBookableSlot,
  openIntervalsOf,
  slotsFor,
  type AvailabilityConfig,
  type BookedSlot,
} from "../availability.js";

/**
 * `slotsFor` est la **seule** source de vérité des créneaux : le client qui
 * réserve et l'admin qui prévisualise l'appellent tous les deux. Chaque règle du
 * §4 de `architecture-prise-de-rendez-vous.md` a son test nommé ici.
 */

/** Mercredi 2026-06-10 (heure d'été, UTC+2) — la journée de référence des cas. */
const WEDNESDAY = "2026-06-10";
/** Bien avant la journée testée : les bornes de politique ne filtrent rien. */
const NOW = new Date("2026-06-01T08:00:00.000Z");

const POLICY: BookingPolicy = {
  slotMinutes: 30,
  leadTimeHours: 24,
  horizonDays: 30,
  channels: ["phone"],
};

function rule(weekday: number, startTime: string, endTime: string): AvailabilityRuleView {
  return { id: `rule_${weekday}_${startTime}`, weekday, startTime, endTime };
}

function exception(
  day: string,
  kind: "closed" | "open",
  startTime: string | null = null,
  endTime: string | null = null,
): AvailabilityExceptionView {
  return {
    id: `exc_${day}_${kind}_${startTime ?? "all"}`,
    day,
    kind,
    startTime,
    endTime,
    reason: "",
  };
}

function config(
  rules: AvailabilityRuleView[],
  exceptions: AvailabilityExceptionView[] = [],
  policy: Partial<BookingPolicy> = {},
): AvailabilityConfig {
  return { rules, exceptions, policy: { ...POLICY, ...policy } };
}

/** Les heures locales des créneaux d'une journée — la lecture qui compte. */
function timesOf(
  cfg: AvailabilityConfig,
  taken: readonly BookedSlot[] = [],
  now: Date = NOW,
  day = WEDNESDAY,
): string[] {
  return slotsFor({ from: day, to: day }, cfg, taken, now).map((s) => s.time);
}

describe("slotsFor", () => {
  it("découpe une règle 09:00–12:00 en 6 créneaux de 30 min", () => {
    expect(timesOf(config([rule(3, "09:00", "12:00")]))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
  });

  it("rend des instants UTC cohérents avec l'heure locale déclarée", () => {
    const slots = slotsFor(
      { from: WEDNESDAY, to: WEDNESDAY },
      config([rule(3, "09:00", "10:00")]),
      [],
      NOW,
    );
    expect(slots[0]).toEqual({
      startAt: "2026-06-10T07:00:00.000Z",
      endAt: "2026-06-10T07:30:00.000Z",
      day: WEDNESDAY,
      time: "09:00",
    });
  });

  it("ne produit rien un jour sans règle", () => {
    // La règle porte sur le mardi (2), la journée testée est un mercredi (3).
    expect(timesOf(config([rule(2, "09:00", "12:00")]))).toEqual([]);
  });

  it("laisse tomber la fin de plage qui ne contient pas un créneau entier", () => {
    expect(timesOf(config([rule(3, "09:00", "10:20")]))).toEqual(["09:00", "09:30"]);
  });

  it("fusionne deux règles qui se chevauchent au lieu de doubler les créneaux", () => {
    expect(timesOf(config([rule(3, "09:00", "10:00"), rule(3, "09:30", "11:00")]))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
    ]);
  });

  it("une exception « closed » sans bornes ferme toute la journée", () => {
    expect(timesOf(config([rule(3, "09:00", "12:00")], [exception(WEDNESDAY, "closed")]))).toEqual(
      [],
    );
  });

  it("une exception « closed » bornée coupe la plage en deux", () => {
    const cfg = config(
      [rule(3, "09:00", "12:00")],
      [exception(WEDNESDAY, "closed", "10:00", "11:00")],
    );
    expect(timesOf(cfg)).toEqual(["09:00", "09:30", "11:00", "11:30"]);
  });

  it("une exception « open » ouvre un jour hors grille", () => {
    // Samedi 2026-06-13 : aucune règle, mais une ouverture ponctuelle.
    const cfg = config(
      [rule(3, "09:00", "12:00")],
      [exception("2026-06-13", "open", "10:00", "11:00")],
    );
    expect(timesOf(cfg, [], NOW, "2026-06-13")).toEqual(["10:00", "10:30"]);
  });

  it("une fermeture de journée l'emporte sur une ouverture ponctuelle du même jour", () => {
    const cfg = config(
      [rule(3, "09:00", "12:00")],
      [exception(WEDNESDAY, "open", "14:00", "15:00"), exception(WEDNESDAY, "closed")],
    );
    expect(timesOf(cfg)).toEqual([]);
  });

  it("retire les créneaux déjà pris, et eux seuls", () => {
    const taken: BookedSlot[] = [
      {
        startAt: new Date("2026-06-10T08:00:00.000Z"),
        endAt: new Date("2026-06-10T08:30:00.000Z"),
      },
    ];
    // 08:00 UTC = 10:00 locales : seul ce créneau-là disparaît.
    expect(timesOf(config([rule(3, "09:00", "11:00")]), taken)).toEqual([
      "09:00",
      "09:30",
      "10:30",
    ]);
  });

  it("retire un créneau qu'un rendez-vous plus long recouvre partiellement", () => {
    const taken: BookedSlot[] = [
      {
        startAt: new Date("2026-06-10T07:15:00.000Z"),
        endAt: new Date("2026-06-10T08:15:00.000Z"),
      },
    ];
    expect(timesOf(config([rule(3, "09:00", "11:00")]), taken)).toEqual(["10:30"]);
  });

  it("applique le délai de prévenance : rien avant now + leadTimeHours", () => {
    const now = new Date("2026-06-10T06:00:00.000Z"); // 08:00 locales
    const cfg = config([rule(3, "09:00", "12:00")], [], { leadTimeHours: 3 });
    // 08:00 + 3 h = 11:00 locales.
    expect(timesOf(cfg, [], now)).toEqual(["11:00", "11:30"]);
  });

  it("applique l'horizon : rien au-delà de now + horizonDays", () => {
    const now = new Date("2026-06-08T08:00:00.000Z");
    const cfg = config([rule(3, "09:00", "12:00")], [], { leadTimeHours: 0, horizonDays: 1 });
    expect(timesOf(cfg, [], now)).toEqual([]);
  });

  it("saute l'heure locale inexistante du passage à l'heure d'été", () => {
    // Dimanche 2026-03-29 : 02:00 → 03:00. Une règle 01:00–04:00 ce jour-là ne
    // peut pas produire 02:00 ni 02:30 — ces heures n'existent pas.
    const cfg = config([rule(0, "01:00", "04:00")], [], { leadTimeHours: 0 });
    const times = timesOf(cfg, [], new Date("2026-03-28T00:00:00.000Z"), "2026-03-29");
    expect(times).toEqual(["01:00", "01:30", "03:00", "03:30"]);
  });

  it("garde la même heure locale de part et d'autre du changement d'heure", () => {
    const cfg = config([rule(1, "09:00", "10:00")], [], { leadTimeHours: 0, horizonDays: 365 });
    const now = new Date("2026-03-01T00:00:00.000Z");
    const before = slotsFor({ from: "2026-03-23", to: "2026-03-23" }, cfg, [], now);
    const after = slotsFor({ from: "2026-03-30", to: "2026-03-30" }, cfg, [], now);
    expect(before[0]?.time).toBe("09:00");
    expect(after[0]?.time).toBe("09:00");
    // Même heure locale, instants UTC différents : c'est exactement le but.
    expect(before[0]?.startAt).toBe("2026-03-23T08:00:00.000Z");
    expect(after[0]?.startAt).toBe("2026-03-30T07:00:00.000Z");
  });

  it("couvre plusieurs jours et rend les créneaux triés dans le temps", () => {
    const cfg = config([rule(3, "09:00", "10:00"), rule(4, "14:00", "15:00")]);
    const slots = slotsFor({ from: WEDNESDAY, to: "2026-06-11" }, cfg, [], NOW);
    expect(slots.map((s) => `${s.day} ${s.time}`)).toEqual([
      "2026-06-10 09:00",
      "2026-06-10 09:30",
      "2026-06-11 14:00",
      "2026-06-11 14:30",
    ]);
  });

  it("borne une fenêtre absurde au lieu de calculer un an de créneaux", () => {
    const cfg = config([rule(3, "09:00", "09:30")], [], { horizonDays: 365 });
    const slots = slotsFor({ from: "2026-06-10", to: "2030-06-10" }, cfg, [], NOW);
    // 120 jours de fenêtre max ⇒ 18 mercredis au plus.
    expect(slots.length).toBeLessThanOrEqual(18);
  });
});

describe("openIntervalsOf", () => {
  it("rend les plages ouvertes en minutes, fusionnées et triées", () => {
    const cfg = config([rule(3, "14:00", "15:00"), rule(3, "09:00", "10:00")]);
    expect(openIntervalsOf(WEDNESDAY, cfg)).toEqual([
      { start: 540, end: 600 },
      { start: 840, end: 900 },
    ]);
  });
});

describe("isBookableSlot", () => {
  const cfg = config([rule(3, "09:00", "12:00")]);

  it("accepte un instant qui est exactement un créneau ouvert", () => {
    expect(isBookableSlot(new Date("2026-06-10T07:00:00.000Z"), cfg, [], NOW)).toBe(true);
  });

  it("refuse un instant décalé de quelques minutes", () => {
    expect(isBookableSlot(new Date("2026-06-10T07:10:00.000Z"), cfg, [], NOW)).toBe(false);
  });

  it("refuse un instant hors des plages déclarées", () => {
    expect(isBookableSlot(new Date("2026-06-10T15:00:00.000Z"), cfg, [], NOW)).toBe(false);
  });

  it("refuse un créneau déjà pris", () => {
    const taken: BookedSlot[] = [
      {
        startAt: new Date("2026-06-10T07:00:00.000Z"),
        endAt: new Date("2026-06-10T07:30:00.000Z"),
      },
    ];
    expect(isBookableSlot(new Date("2026-06-10T07:00:00.000Z"), cfg, taken, NOW)).toBe(false);
  });

  it("refuse un créneau sous le délai de prévenance", () => {
    const now = new Date("2026-06-10T06:45:00.000Z");
    expect(isBookableSlot(new Date("2026-06-10T07:00:00.000Z"), cfg, [], now)).toBe(false);
  });
});
