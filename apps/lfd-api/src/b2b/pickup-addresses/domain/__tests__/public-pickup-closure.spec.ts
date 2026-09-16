import { PublicPickupClosurePeriodError } from "../pickup-errors.js";
import { PublicPickupClosure, type PublicPickupClosureState } from "../public-pickup-closure.js";

/**
 * Les fermetures datées (plan `documentation/b2b/plan-creneaux-de-retrait.md`,
 * D4). Ces jours sont ABSOLUS et ne sont comparés qu'entre eux — jamais à
 * l'horloge : c'est l'exception étroite de `CLAUDE.md` §5.
 */
const VALID: PublicPickupClosureState = {
  fromDay: "2027-05-10",
  toDay: "2027-05-20",
  startTime: null,
  endTime: null,
  reason: "Congés",
};

function of(overrides: Partial<PublicPickupClosureState> = {}): PublicPickupClosure {
  return PublicPickupClosure.of({ ...VALID, ...overrides });
}

describe("PublicPickupClosure", () => {
  it("accepte un intervalle de jours sans bornes horaires — la journée entière", () => {
    const closure = of();

    expect(closure.fromDay).toBe("2027-05-10");
    expect(closure.toDay).toBe("2027-05-20");
    expect(closure.startTime).toBeNull();
  });

  it("accepte une fermeture d'un seul jour, bornée", () => {
    expect(
      of({ fromDay: "2027-05-10", toDay: "2027-05-10", startTime: "12:00", endTime: "14:00" })
        .endTime,
    ).toBe("14:00");
  });

  it("refuse un dernier jour antérieur au premier", () => {
    const attempt = (): PublicPickupClosure => of({ fromDay: "2027-05-20", toDay: "2027-05-10" });

    expect(attempt).toThrow(PublicPickupClosurePeriodError);
    expect(attempt).toThrow("le dernier jour doit suivre le premier");
  });

  /**
   * Une fermeture à moitié bornée laisserait deviner l'autre côté — et une
   * ignorance qu'on ne peut pas dire finit par être comblée par une valeur
   * inventée.
   */
  it("refuse une fermeture qui n'a qu'une de ses deux heures", () => {
    expect(() => of({ startTime: "12:00", endTime: null })).toThrow(PublicPickupClosurePeriodError);
    expect(() => of({ startTime: null, endTime: "14:00" })).toThrow(PublicPickupClosurePeriodError);
  });

  it("refuse une heure de fin qui précède le début", () => {
    expect(() => of({ startTime: "14:00", endTime: "12:00" })).toThrow(
      PublicPickupClosurePeriodError,
    );
  });

  it("refuse un jour qui n'en est pas un", () => {
    expect(() => of({ fromDay: "10/05/2027" })).toThrow(PublicPickupClosurePeriodError);
  });

  it("nettoie le motif de ses espaces de bord", () => {
    expect(of({ reason: "  Four en panne  " }).reason).toBe("Four en panne");
  });
});
