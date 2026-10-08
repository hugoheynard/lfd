import { CargoFloor } from "../../value-objects/cargo-floor.js";
import type { WheelArchesInput } from "../../value-objects/wheel-arches.js";
import { type PlanBin, type PlanBinType, type PlanStop, planLoading } from "../loading-plan.js";
import type { PlanVehicle } from "../loading-volume.js";

/**
 * Les piles au sol revues par Hugo le 2026-10-08
 * (`documentation/livraisons/chargement/plan-piles-au-sol-revues.md`) : le jeu
 * est un réglage (G5a), une pile monte au-dessus d'un passage (G5b), une pile
 * sortie ne bloque plus les suivantes (G5c).
 */
const GAP_CM = 1;

/** 60 × 40 × 25 cm, quatre étages sous un plafond de 100 cm. */
const BAC: PlanBinType = {
  id: "bac",
  name: "Bac 60 × 40",
  isotherm: false,
  outerLengthMm: 600,
  outerWidthMm: 400,
  outerHeightMm: 250,
  maxStack: 4,
};
/** 60 × 40, une seule par pile : chaque bac est une pile. */
const SOLO: PlanBinType = { ...BAC, id: "solo", name: "Bac seul", maxStack: 1 };
/** 40 × 30, seul aussi. */
const PETIT: PlanBinType = {
  ...SOLO,
  id: "petit",
  name: "Petit bac",
  outerLengthMm: 400,
  outerWidthMm: 300,
};

function van(lengthCm: number, wheelArches: WheelArchesInput | null = null): PlanVehicle {
  const floor = CargoFloor.of({ lengthCm, widthCm: 100, heightCm: 100, wheelArches });
  return { name: "Camionnette", cargoLiters: floor.volumeLiters, refrigeratedLiters: null, floor };
}

function stop(position: number, binType: PlanBinType, count: number): PlanStop {
  const bins: PlanBin[] = Array.from({ length: count }, (_, index) => ({
    id: `${binType.id}-${String(position)}-${String(index + 1)}`,
    code: `B${String(position)}${String(index + 1)}`,
    binType,
    half: null,
    physicalBinId: null,
    partner: null,
    toRedo: false,
  }));
  return {
    position,
    orderId: `o${String(position)}`,
    reference: `R-${String(position)}`,
    customerLabel: "",
    bins,
  };
}

describe("le plan de chargement — les piles au sol revues (2026-10-08)", () => {
  it("G5a : le jeu vient du paramètre — 0 cm fait tenir ce que 1 cm sort", () => {
    // 121 cm : sans jeu, deux rangées de 60 cm (quatre piles) ; avec 1 cm,
    // une rangée de 61 cm puis une seule pile tournée sur 41 cm.
    const stops = [stop(1, SOLO, 5)];
    const floorKinds = (gapCm: number) =>
      planLoading(stops, van(121), gapCm).stacks.map((stack) => stack.placement?.kind);

    expect(floorKinds(0)).toEqual(["floor", "floor", "floor", "floor", "off_floor"]);
    expect(floorKinds(GAP_CM)).toEqual(["floor", "floor", "floor", "off_floor", "off_floor"]);
  });

  it("G5b : une pile monte au-dessus d'un passage, bornée à étages − k₀", () => {
    const arches = { lengthCm: 50, protrusionCm: 10, fromBackCm: 70, heightCm: 30 };

    const plan = planLoading([stop(1, BAC, 15)], van(200, arches), GAP_CM);

    // Rangée 1 : deux piles de 4 ; rangée 2 : une au sol (4), une au-dessus
    // du passage gauche à partir de l'étage 2 (k₀ = ⌈30 ÷ 25⌉), 2 bacs au plus.
    expect(plan.stacks.map((stack) => stack.height)).toEqual([4, 4, 4, 2, 1]);
    expect(plan.stacks[3]?.placement).toMatchObject({
      row: 2,
      overArch: { side: "left", fromLevel: 2, levels: 2 },
    });
    expect(plan.stacks[4]?.placement).toMatchObject({ row: 3, overArch: null });
  });

  /**
   * G5c : jusqu'au 2026-10-08, la pile sortie emmenait les suivantes — le
   * petit bac de l'arrêt 1 sortait aussi, et l'alerte nommait les deux arrêts.
   */
  it("G5c : une pile sortie ne bloque plus une plus petite, l'alerte ne nomme qu'elle", () => {
    // Chargés à l'envers : les sept bacs de l'arrêt 2, puis le petit de l'arrêt 1.
    const plan = planLoading([stop(1, PETIT, 1), stop(2, SOLO, 7)], van(220), GAP_CM);

    const kinds = plan.stacks.map((stack) => stack.placement?.kind);
    expect(kinds.filter((kind) => kind === "off_floor")).toHaveLength(1);
    expect(plan.stacks.at(-1)?.placement).toMatchObject({ kind: "floor", row: 4 });
    expect(plan.warnings.filter((warning) => warning.kind === "floor_over")).toEqual([
      {
        kind: "floor_over",
        message:
          "1 pile ne tient pas au sol de « Camionnette » (arrêt 2) : retirez un arrêt de la tournée ou changez de véhicule.",
      },
    ]);
  });
});
