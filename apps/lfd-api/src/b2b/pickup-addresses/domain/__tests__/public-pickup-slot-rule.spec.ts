import {
  PublicPickupBadgeEmptyError,
  PublicPickupServiceCapacityError,
  PublicPickupSlotRangeError,
  PublicPickupSlotStepError,
} from "../pickup-errors.js";
import {
  PublicPickupSlotRule,
  type PublicPickupSlotRuleState,
} from "../public-pickup-slot-rule.js";

/**
 * Les quatre refus qui ne concernent qu'UNE règle (plan
 * `documentation/b2b/plan-creneaux-de-retrait.md`, D2 et D7). Le chevauchement,
 * lui, est l'affaire de l'agrégat.
 */
const VALID: PublicPickupSlotRuleState = {
  weekday: "mon",
  startTime: "07:00",
  endTime: "09:00",
  slotMinutes: 15,
  badge: null,
  serviceCapacity: null,
};

function of(overrides: Partial<PublicPickupSlotRuleState> = {}): PublicPickupSlotRule {
  return PublicPickupSlotRule.of({ ...VALID, ...overrides });
}

describe("PublicPickupSlotRule", () => {
  it("accepte une plage découpée au quart d'heure, sans badge ni capacité", () => {
    const rule = of();

    expect(rule.startMinutes).toBe(7 * 60);
    expect(rule.endMinutes).toBe(9 * 60);
    expect(rule.badge).toBeNull();
    expect(rule.serviceCapacity).toBeNull();
  });

  it("refuse une plage à l'envers, en nommant le geste de sortie", () => {
    const attempt = (): PublicPickupSlotRule => of({ startTime: "09:00", endTime: "07:00" });

    expect(attempt).toThrow(PublicPickupSlotRangeError);
    expect(attempt).toThrow("mettez une fin postérieure au début");
  });

  it("refuse une plage vide", () => {
    expect(() => of({ startTime: "07:00", endTime: "07:00" })).toThrow(PublicPickupSlotRangeError);
  });

  /** Une règle qui n'ouvre aucun créneau s'afficherait pourtant comme ouverte. */
  it("refuse une découpe qui ne produit aucun créneau", () => {
    const attempt = (): PublicPickupSlotRule =>
      of({ startTime: "07:00", endTime: "07:10", slotMinutes: 15 });

    expect(attempt).toThrow(PublicPickupSlotStepError);
    expect(attempt).toThrow("raccourcissez la durée ou élargissez la plage");
  });

  it("accepte un pas qui ne divise pas la plage : le reste est simplement inutilisé", () => {
    expect(of({ startTime: "07:00", endTime: "08:00", slotMinutes: 25 }).slotMinutes).toBe(25);
  });

  it("refuse un pas nul ou négatif", () => {
    expect(() => of({ slotMinutes: 0 })).toThrow(PublicPickupSlotStepError);
  });

  /**
   * `null` dit « pas de pastille », une valeur dit ce qu'elle dit — la chaîne
   * vide dirait une troisième chose que personne ne sait lire (vitruve, S10).
   */
  it("refuse un badge vide, et un badge fait d'espaces", () => {
    expect(() => of({ badge: "" })).toThrow(PublicPickupBadgeEmptyError);
    expect(() => of({ badge: "   " })).toThrow(PublicPickupBadgeEmptyError);
  });

  it("garde un badge, débarrassé de ses espaces de bord", () => {
    expect(of({ badge: "  Sortie du four " }).badge).toBe("Sortie du four");
  });

  /** Vide vaut « aucune limite » : `0` fermerait au lieu d'ouvrir sans borne (D3). */
  it("refuse une capacité nulle ou négative", () => {
    expect(() => of({ serviceCapacity: 0 })).toThrow(PublicPickupServiceCapacityError);
    expect(() => of({ serviceCapacity: -3 })).toThrow(PublicPickupServiceCapacityError);
  });

  describe("les croisements, tels que l'agrégat les interroge", () => {
    it("une règle sans jour croise toutes les autres", () => {
      expect(of({ weekday: null }).sharesDaysWith(of({ weekday: "sat" }))).toBe(true);
    });

    it("deux jours différents ne se croisent pas", () => {
      expect(of({ weekday: "mon" }).sharesDaysWith(of({ weekday: "tue" }))).toBe(false);
    });

    it("deux plages qui se touchent bout à bout ne se chevauchent pas", () => {
      const morning = of({ startTime: "07:00", endTime: "09:00" });
      const noon = of({ startTime: "09:00", endTime: "11:00" });

      expect(morning.overlapsHours(noon)).toBe(false);
    });

    it("une minute commune suffit à faire un chevauchement", () => {
      const morning = of({ startTime: "07:00", endTime: "09:00" });
      const late = of({ startTime: "08:59", endTime: "11:00" });

      expect(morning.overlapsHours(late)).toBe(true);
    });
  });
});
