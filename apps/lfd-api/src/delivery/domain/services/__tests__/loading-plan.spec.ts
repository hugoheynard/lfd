import { type PlanBin, type PlanBinType, type PlanStop, planLoading } from "../loading-plan.js";
import type { PlanVehicle } from "../loading-volume.js";

/** 60 × 40 × 25 cm = 60 L extérieurs. */
const BAC_M: PlanBinType = {
  id: "bin_m",
  name: "Bac M",
  isotherm: false,
  outerLengthCm: 60,
  outerWidthCm: 40,
  outerHeightCm: 25,
  maxStack: 3,
};
/** 40 × 30 × 25 cm = 30 L extérieurs. */
const BAC_FROID: PlanBinType = {
  id: "bin_cold",
  name: "Bac S isotherme",
  isotherm: true,
  outerLengthCm: 40,
  outerWidthCm: 30,
  outerHeightCm: 25,
  maxStack: 4,
};

const ROOMY: PlanVehicle = { name: "Kangoo", cargoLiters: 3000, refrigeratedLiters: 500 };

function bin(id: string, overrides: Partial<PlanBin> = {}): PlanBin {
  return {
    id,
    code: id.toUpperCase(),
    binType: BAC_M,
    half: null,
    physicalBinId: null,
    partner: null,
    toRedo: false,
    ...overrides,
  };
}

function stop(orderId: string, position: number, bins: readonly PlanBin[]): PlanStop {
  return { position, orderId, reference: `R-${orderId}`, customerLabel: orderId, bins };
}

/** Les deux moitiés d'un bac physique, à `first` puis `second`. */
function sharedHalves(first: string, second: string): readonly [PlanBin, PlanBin] {
  const common = { physicalBinId: "phys_1" };
  return [
    bin("h_left", {
      ...common,
      half: "left",
      partner: { orderId: second, reference: `R-${second}` },
    }),
    bin("h_right", {
      ...common,
      half: "right",
      partner: { orderId: first, reference: `R-${first}` },
    }),
  ];
}

describe("le plan de chargement v1 — ordre et volume (lot 4 bis, v2-5)", () => {
  it("charge dans l'ordre INVERSE de la tournée : le dernier arrêt d'abord", () => {
    const plan = planLoading(
      [stop("o1", 1, [bin("a")]), stop("o2", 2, [bin("b")]), stop("o3", 3, [])],
      ROOMY,
    );

    expect(plan.steps.map((step) => [step.step, step.stop.position])).toEqual([
      [1, 3],
      [2, 2],
      [3, 1],
    ]);
    // Un arrêt sans bac garde son étape, vide.
    expect(plan.steps[0]?.bins).toEqual([]);
  });

  it("pose le bac partagé à l'étape du PREMIER des deux arrêts, en haut de sa pile", () => {
    const [left, right] = sharedHalves("o1", "o2");
    const plan = planLoading(
      [stop("o1", 1, [left, bin("a1"), bin("a2")]), stop("o2", 2, [right, bin("b1")])],
      ROOMY,
    );

    const [second, first] = plan.steps;
    expect(second?.bins.map((entry) => entry.bin.id)).toEqual(["b1"]);
    expect(first?.bins.map((entry) => [entry.bin.id, entry.reference])).toEqual([
      ["a1", "R-o1"],
      ["a2", "R-o1"],
      ["h_left", "R-o1"],
      ["h_right", "R-o2"],
    ]);
    // Un bac physique : une place dans la pile, la dernière posée.
    expect(plan.stacks).toEqual([
      { stackIndex: 1, binType: BAC_M, height: 3, stopPositions: [2, 1] },
      { stackIndex: 2, binType: BAC_M, height: 1, stopPositions: [1] },
    ]);
    expect(first?.bins.slice(-2).map((entry) => entry.stackIndex)).toEqual([2, 2]);
  });

  it("empile par type jusqu'à maxStack ; un arrêt partage la pile du suivant chargé", () => {
    const plan = planLoading(
      [
        stop("o1", 1, [bin("a1"), bin("c1", { binType: BAC_FROID })]),
        stop("o2", 2, [bin("b1"), bin("b2")]),
      ],
      ROOMY,
    );

    expect(
      plan.stacks.map((stack) => [stack.binType.id, stack.height, stack.stopPositions]),
    ).toEqual([
      ["bin_m", 3, [2, 1]],
      ["bin_cold", 1, [1]],
    ]);
    const four = planLoading([stop("o1", 1, [bin("a"), bin("b"), bin("c"), bin("d")])], ROOMY);
    expect(four.stacks.map((stack) => stack.height)).toEqual([3, 1]);
    expect(four.steps[0]?.bins.map((entry) => entry.stackIndex)).toEqual([1, 1, 1, 2]);
  });

  it("compte le volume EXTÉRIEUR, un bac partagé une fois, et dit ce qui déborde au sec", () => {
    const [left, right] = sharedHalves("o1", "o2");
    const small: PlanVehicle = { name: "Kangoo", cargoLiters: 200, refrigeratedLiters: 50 };

    const plan = planLoading(
      [stop("o1", 1, [left, bin("a"), bin("b")]), stop("o2", 2, [right])],
      small,
    );

    expect(plan.volume).toMatchObject({
      dryLiters: 180,
      dryCapacityLiters: 150,
      dryOver: true,
      coldOver: false,
    });
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["dry_over"]);
    expect(plan.warnings[0]?.message).toContain("30 L de trop");
  });

  it("met les isothermes dans la caisse réfrigérée, et dit quand elle déborde", () => {
    const tight: PlanVehicle = { name: "Frigo", cargoLiters: 1000, refrigeratedLiters: 40 };

    const plan = planLoading(
      [stop("o1", 1, [bin("c1", { binType: BAC_FROID }), bin("c2", { binType: BAC_FROID })])],
      tight,
    );

    expect(plan.volume).toMatchObject({ dryLiters: 0, coldLiters: 60, coldOver: true });
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["cold_over"]);
  });

  it("sans caisse réfrigérée, compte les isothermes au sec et le dit", () => {
    const dry: PlanVehicle = { name: "Trafic", cargoLiters: 1000, refrigeratedLiters: null };

    const plan = planLoading([stop("o1", 1, [bin("c1", { binType: BAC_FROID })])], dry);

    expect(plan.volume).toMatchObject({
      dryLiters: 30,
      coldLiters: 0,
      coldCapacityLiters: null,
      coldOver: false,
    });
    expect(plan.warnings.map((warning) => warning.kind)).toEqual([
      "cold_bins_without_refrigeration",
    ]);
  });

  it("véhicule sans dimensions : jamais « ça tient », toujours `unknown_cargo`", () => {
    const unknown: PlanVehicle = { name: "Vélo", cargoLiters: null, refrigeratedLiters: null };
    const many = Array.from({ length: 40 }, (_, index) => bin(`b${String(index)}`));

    const plan = planLoading([stop("o1", 1, many)], unknown);

    expect(plan.volume).toMatchObject({ dryLiters: 2400, dryCapacityLiters: null, dryOver: false });
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["unknown_cargo"]);
    expect(planLoading([], unknown).warnings.map((warning) => warning.kind)).toEqual([
      "unknown_cargo",
    ]);
  });

  it("signale UNE fois un bac partagé à refaire, et le charge chez son propre arrêt si l'autre est ailleurs", () => {
    const partner = { orderId: "elsewhere", reference: "R-elsewhere" };
    const redo = bin("h1", { half: "left", physicalBinId: "phys_9", partner, toRedo: true });

    const plan = planLoading([stop("o1", 1, [bin("a")]), stop("o2", 2, [redo])], ROOMY);

    expect(plan.steps[0]?.bins.map((entry) => entry.bin.id)).toEqual(["h1"]);
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["bin_to_redo"]);
    expect(plan.warnings[0]?.message).toContain("H1 (partagé avec R-elsewhere)");
  });

  it("une tournée sans bac rend un plan vide, lisible", () => {
    const plan = planLoading([stop("o1", 1, [])], ROOMY);

    expect(plan.stacks).toEqual([]);
    expect(plan.volume).toMatchObject({ dryLiters: 0, coldLiters: 0, dryCapacityLiters: 2500 });
    expect(plan.warnings).toEqual([]);
  });
});
