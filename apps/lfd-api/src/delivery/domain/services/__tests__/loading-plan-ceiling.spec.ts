import { CargoFloor } from "../../value-objects/cargo-floor.js";
import { capacityGuardOf } from "../capacity-guard.js";
import { type PlanBin, type PlanBinType, type PlanStop, planLoading } from "../loading-plan.js";
import type { PlanVehicle } from "../loading-volume.js";

/**
 * Régression (2026-10-06) : le plan de chargement ne comparait jamais la
 * hauteur utile de la caisse à celle d'une pile. Deux mannes de 715 mm, pile
 * max 2, font 1430 mm : une caisse de 140 cm ne les empile pas, mais le plan
 * leur comptait deux étages — et « Proposer » chargeait le double de mannes.
 */
const MANNE: PlanBinType = {
  id: "manne",
  name: "Manne à pain",
  isotherm: false,
  outerLengthMm: 665,
  outerWidthMm: 460,
  outerHeightMm: 715,
  maxStack: 2,
};

function van(heightCm: number, refrigeratedLiters: number | null = null): PlanVehicle {
  const floor = CargoFloor.of({ lengthCm: 70, widthCm: 50, heightCm, wheelArches: null });
  return { name: "Camionnette", cargoLiters: floor.volumeLiters, refrigeratedLiters, floor };
}

function mannes(count: number, binType: PlanBinType = MANNE): readonly PlanStop[] {
  const bins: PlanBin[] = Array.from({ length: count }, (_, index) => ({
    id: `${binType.id}-${String(index + 1)}`,
    code: `M${String(index + 1)}`,
    binType,
    half: null,
    physicalBinId: null,
    partner: null,
    toRedo: false,
  }));
  return [{ position: 1, orderId: "o1", reference: "R-o1", customerLabel: "o1", bins }];
}

describe("le plan de chargement — le plafond de la caisse (2026-10-06)", () => {
  it("deux mannes ne s'empilent pas dans une caisse de 140 cm", () => {
    const plan = planLoading(mannes(2), van(140));

    expect(plan.stacks.map((stack) => stack.height)).toEqual([1, 1]);
    // Une seule place au sol (70 × 50) : la seconde manne sort.
    expect(plan.stacks.map((stack) => stack.placement?.kind)).toEqual(["floor", "off_floor"]);
    expect(plan.warnings.map((warning) => warning.kind)).toContain("floor_over");
  });

  it("deux mannes s'empilent dans une caisse de 145 cm : 1430 mm sous 1450", () => {
    const plan = planLoading(mannes(2), van(145));

    expect(plan.stacks.map((stack) => stack.height)).toEqual([2]);
    expect(plan.warnings).toEqual([]);
  });

  it("une manne plus haute que la caisse ne tient pas, et l'alerte dit pourquoi", () => {
    const plan = planLoading(mannes(1), van(70));

    expect(plan.stacks[0]?.placement).toEqual({ kind: "off_floor" });
    expect(plan.warnings.find((warning) => warning.kind === "floor_over")?.message).toBe(
      "1 pile ne tient pas au sol de « Camionnette » (arrêt 1), dont 1 dont le bac est plus haut que la caisse : retirez un arrêt de la tournée ou changez de véhicule.",
    );
  });

  it("une manne trop haute ne bloque pas le plancher pour les bacs suivants", () => {
    const low: PlanBinType = { ...MANNE, id: "low", name: "Bac bas", outerHeightMm: 300 };
    const stops: PlanStop[] = [
      ...mannes(1, low).map((stop) => ({ ...stop, position: 1, orderId: "o1" })),
      ...mannes(1).map((stop) => ({ ...stop, position: 2, orderId: "o2", reference: "R-o2" })),
    ];
    // Chargée d'abord (dernier arrêt), la manne trop haute sort ; le bac bas se pose quand même.
    const plan = planLoading(stops, van(70));

    expect(plan.stacks.map((stack) => stack.placement?.kind)).toEqual(["off_floor", "floor"]);
  });

  it("un isotherme en caisse réfrigérée n'est borné que par sa pile", () => {
    const cold: PlanBinType = { ...MANNE, id: "cold", isotherm: true };
    const plan = planLoading(mannes(2, cold), van(140, 100));

    expect(plan.stacks.map((stack) => [stack.height, stack.placement?.kind])).toEqual([
      [2, "refrigerated"],
    ]);
  });
});

describe("la garde de capacité — le plafond de la caisse (2026-10-06)", () => {
  const capacity = (vehicle: PlanVehicle, count: number) => ({
    vehicles: new Map([["van", vehicle]]),
    bins: new Map([["o1", mannes(count)[0]?.bins ?? []]]),
  });
  const route = { roundId: null, stops: [{ id: "o1", window: null }] };

  it("refuse deux mannes dans une caisse de 140 cm à une seule place au sol", () => {
    expect(capacityGuardOf(capacity(van(140), 2)).fits("van", [route])).toBe(false);
    expect(capacityGuardOf(capacity(van(145), 2)).fits("van", [route])).toBe(true);
  });

  it("refuse une manne plus haute que la caisse", () => {
    expect(capacityGuardOf(capacity(van(70), 1)).fits("van", [route])).toBe(false);
  });
});
