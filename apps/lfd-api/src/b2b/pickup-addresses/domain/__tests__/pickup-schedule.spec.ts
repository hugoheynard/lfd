import { PickupSchedule } from "../pickup-schedule.js";
import { PublicPickupSlotRulesOverlapError } from "../pickup-errors.js";
import { PublicPickupClosure } from "../public-pickup-closure.js";
import {
  PublicPickupSlotRule,
  type PublicPickupSlotRuleState,
} from "../public-pickup-slot-rule.js";

/**
 * L'agrégat n'a **qu'un** invariant, et c'est lui qui le justifie : deux règles
 * du même point ne peuvent pas viser le même jour à la même heure (plan
 * `documentation/b2b/plan-creneaux-de-retrait.md`, D7).
 */
const POINT = "pickup_1";

function rule(overrides: Partial<PublicPickupSlotRuleState> = {}): PublicPickupSlotRule {
  return PublicPickupSlotRule.of({
    weekday: "mon",
    startTime: "07:00",
    endTime: "09:00",
    slotMinutes: 15,
    badge: null,
    serviceCapacity: null,
    ...overrides,
  });
}

const CLOSURE = PublicPickupClosure.of({
  fromDay: "2027-05-10",
  toDay: "2027-05-20",
  startTime: null,
  endTime: null,
  reason: "Congés",
});

describe("PickupSchedule", () => {
  it("un point sans règle n'est pas réglé — l'état de tous les points avant ce chantier", () => {
    const schedule = PickupSchedule.empty(POINT);

    expect(schedule.isConfigured).toBe(false);
    expect(schedule.ruleCount).toBe(0);
    expect(schedule.toPersistence()).toEqual({ pickupAddressId: POINT, rules: [], closures: [] });
  });

  it("accepte plusieurs plages d'un même jour tant qu'elles ne se recouvrent pas", () => {
    const schedule = PickupSchedule.empty(POINT);

    schedule.replace(
      [
        rule({ startTime: "07:00", endTime: "09:00", badge: "Sortie du four" }),
        rule({ startTime: "09:00", endTime: "11:00", badge: "Tout est chaud" }),
      ],
      [CLOSURE],
    );

    expect(schedule.ruleCount).toBe(2);
    expect(schedule.closureCount).toBe(1);
    expect(schedule.isConfigured).toBe(true);
  });

  /**
   * 🔴 Deux plages qui se recouvrent offriraient la même heure deux fois, avec
   * deux badges et deux capacités, sans que rien ne dise laquelle gagne.
   */
  it("refuse deux plages du même jour qui se chevauchent, en les nommant", () => {
    const schedule = PickupSchedule.empty(POINT);

    const attempt = (): void =>
      schedule.replace(
        [
          rule({ startTime: "07:00", endTime: "09:00" }),
          rule({ startTime: "08:30", endTime: "10:00" }),
        ],
        [],
      );

    expect(attempt).toThrow(PublicPickupSlotRulesOverlapError);
    expect(attempt).toThrow("mon 07:00–09:00");
    expect(attempt).toThrow("mon 08:30–10:00");
  });

  it("refuse une plage « tous les jours » qui recouvre l'heure d'une plage datée", () => {
    const schedule = PickupSchedule.empty(POINT);

    expect(() =>
      schedule.replace(
        [rule({ weekday: "sat", startTime: "07:00", endTime: "09:00" }), rule({ weekday: null })],
        [],
      ),
    ).toThrow(PublicPickupSlotRulesOverlapError);
  });

  it("accepte la même heure sur deux jours différents", () => {
    const schedule = PickupSchedule.empty(POINT);

    schedule.replace([rule({ weekday: "mon" }), rule({ weekday: "tue" })], []);

    expect(schedule.ruleCount).toBe(2);
  });

  it("un refus ne laisse rien d'écrit : l'horaire reste celui d'avant", () => {
    const schedule = PickupSchedule.empty(POINT);
    schedule.replace([rule({ startTime: "07:00", endTime: "08:00" })], []);

    expect(() =>
      schedule.replace(
        [
          rule({ startTime: "07:00", endTime: "09:00" }),
          rule({ startTime: "08:00", endTime: "10:00" }),
        ],
        [],
      ),
    ).toThrow(PublicPickupSlotRulesOverlapError);
    expect(schedule.toPersistence().rules).toEqual([
      expect.objectContaining({ startTime: "07:00", endTime: "08:00" }),
    ]);
  });

  describe("relecture depuis la base", () => {
    it("rejoue les value objects et rend l'état écrit", () => {
      const schedule = PickupSchedule.reconstitute({
        pickupAddressId: POINT,
        rules: [
          {
            weekday: "fri",
            startTime: "07:00",
            endTime: "08:00",
            slotMinutes: 20,
            badge: "  Pain chaud ",
            serviceCapacity: 5,
          },
        ],
        closures: [
          {
            fromDay: "2027-05-10",
            toDay: "2027-05-10",
            startTime: "12:00",
            endTime: "14:00",
            reason: "Inventaire",
          },
        ],
      });

      expect(schedule.toPersistence().rules[0]).toMatchObject({
        badge: "Pain chaud",
        serviceCapacity: 5,
      });
      expect(schedule.closureCount).toBe(1);
    });

    /** Une base qui aurait dérivé le dit ici, pas à l'affichage. */
    it("refuse de rehydrater deux règles stockées qui se chevauchent", () => {
      const overlapping = {
        weekday: "mon",
        slotMinutes: 15,
        badge: null,
        serviceCapacity: null,
      } as const;

      expect(() =>
        PickupSchedule.reconstitute({
          pickupAddressId: POINT,
          rules: [
            { ...overlapping, startTime: "07:00", endTime: "09:00" },
            { ...overlapping, startTime: "08:00", endTime: "10:00" },
          ],
          closures: [],
        }),
      ).toThrow(PublicPickupSlotRulesOverlapError);
    });
  });
});
