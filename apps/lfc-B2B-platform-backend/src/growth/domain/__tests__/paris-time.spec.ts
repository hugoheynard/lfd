import {
  addDays,
  addMinutes,
  instantToLocal,
  localToInstant,
  minutesOfDay,
  timeOfMinutes,
  weekdayOf,
} from "../paris-time.js";

/**
 * Le fuseau est la seule partie du rendez-vous qui peut mentir sans qu'on le
 * voie : un décalage d'une heure deux fois par an, et un créneau qui n'existe
 * pas. Ces tests figent les deux bascules.
 */
describe("paris-time", () => {
  describe("localToInstant", () => {
    it("applique UTC+1 en heure d'hiver", () => {
      const instant = localToInstant("2026-01-15", "09:00");
      expect(instant?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    });

    it("applique UTC+2 en heure d'été", () => {
      const instant = localToInstant("2026-07-15", "09:00");
      expect(instant?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
    });

    it("rend null pour une heure locale INEXISTANTE (bascule de mars)", () => {
      // 2026-03-29 : 02:00 → 03:00, donc 02:30 n'existe pas ce jour-là.
      expect(localToInstant("2026-03-29", "02:30")).toBeNull();
    });

    it("retient la PREMIÈRE occurrence d'une heure ambiguë (bascule d'octobre)", () => {
      // 2026-10-25 : 03:00 → 02:00, donc 02:30 existe deux fois (UTC+2 puis +1).
      const instant = localToInstant("2026-10-25", "02:30");
      expect(instant?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    });

    it("tient de part et d'autre de la bascule d'été, à heure locale égale", () => {
      expect(localToInstant("2026-03-28", "09:00")?.toISOString()).toBe("2026-03-28T08:00:00.000Z");
      expect(localToInstant("2026-03-30", "09:00")?.toISOString()).toBe("2026-03-30T07:00:00.000Z");
    });

    it("rejette une saisie qui n'est pas une date", () => {
      expect(localToInstant("pas-une-date", "09:00")).toBeNull();
    });
  });

  describe("instantToLocal", () => {
    it("rend la lecture parisienne d'un instant UTC", () => {
      expect(instantToLocal(new Date("2026-07-15T07:00:00.000Z"))).toEqual({
        day: "2026-07-15",
        time: "09:00",
      });
    });

    it("bascule de jour : 23h UTC en été, c'est déjà le lendemain à Paris", () => {
      expect(instantToLocal(new Date("2026-07-15T23:30:00.000Z"))).toEqual({
        day: "2026-07-16",
        time: "01:30",
      });
    });

    it("rend 00:00 à minuit local, jamais 24:00", () => {
      expect(instantToLocal(new Date("2026-01-15T23:00:00.000Z"))).toEqual({
        day: "2026-01-16",
        time: "00:00",
      });
    });

    it("fait l'aller-retour sans dérive", () => {
      const iso = "2026-05-04T12:45:00.000Z";
      const local = instantToLocal(new Date(iso));
      expect(localToInstant(local.day, local.time)?.toISOString()).toBe(iso);
    });
  });

  describe("helpers de calendrier", () => {
    it("addDays traverse une fin de mois et une année bissextile", () => {
      expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
      expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
      expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    });

    it("weekdayOf suit la convention Date.getDay (0 = dimanche)", () => {
      expect(weekdayOf("2026-08-09")).toBe(0);
      expect(weekdayOf("2026-08-10")).toBe(1);
      expect(weekdayOf("2026-08-15")).toBe(6);
    });

    it("minutesOfDay et timeOfMinutes sont réciproques", () => {
      expect(minutesOfDay("09:30")).toBe(570);
      expect(timeOfMinutes(570)).toBe("09:30");
      expect(timeOfMinutes(minutesOfDay("00:05"))).toBe("00:05");
    });

    it("addMinutes ne mute pas l'instant reçu", () => {
      const start = new Date("2026-07-15T07:00:00.000Z");
      const later = addMinutes(start, 30);
      expect(later.toISOString()).toBe("2026-07-15T07:30:00.000Z");
      expect(start.toISOString()).toBe("2026-07-15T07:00:00.000Z");
    });
  });
});
