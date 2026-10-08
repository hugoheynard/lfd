import { BIN_GAP_DEFAULT_CM } from "../../value-objects/bin-gap.js";
import { type PlanBin, type PlanBinType, type PlanStop, planLoading } from "../loading-plan.js";
import { CargoFloor } from "../../value-objects/cargo-floor.js";
import type { PlanVehicle } from "../loading-volume.js";

/** 60 × 40 × 25 cm = 60 L extérieurs. */
const BAC_M: PlanBinType = {
  id: "bin_m",
  name: "Bac M",
  isotherm: false,
  outerLengthMm: 600,
  outerWidthMm: 400,
  outerHeightMm: 250,
  maxStack: 3,
};
/** 40 × 30 × 25 cm = 30 L extérieurs. */
const BAC_FROID: PlanBinType = {
  id: "bin_cold",
  name: "Bac S isotherme",
  isotherm: true,
  outerLengthMm: 400,
  outerWidthMm: 300,
  outerHeightMm: 250,
  maxStack: 4,
};

const ROOMY: PlanVehicle = {
  name: "Kangoo",
  cargoLiters: 3000,
  refrigeratedLiters: 500,
  floor: null,
};

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
      BIN_GAP_DEFAULT_CM,
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
      BIN_GAP_DEFAULT_CM,
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
      { stackIndex: 1, binType: BAC_M, height: 3, stopPositions: [2, 1], placement: null },
      { stackIndex: 2, binType: BAC_M, height: 1, stopPositions: [1], placement: null },
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
      BIN_GAP_DEFAULT_CM,
    );

    expect(
      plan.stacks.map((stack) => [stack.binType.id, stack.height, stack.stopPositions]),
    ).toEqual([
      ["bin_m", 3, [2, 1]],
      ["bin_cold", 1, [1]],
    ]);
    const four = planLoading(
      [stop("o1", 1, [bin("a"), bin("b"), bin("c"), bin("d")])],
      ROOMY,
      BIN_GAP_DEFAULT_CM,
    );
    expect(four.stacks.map((stack) => stack.height)).toEqual([3, 1]);
    expect(four.steps[0]?.bins.map((entry) => entry.stackIndex)).toEqual([1, 1, 1, 2]);
  });

  it("compte le volume EXTÉRIEUR, un bac partagé une fois, et dit ce qui déborde au sec", () => {
    const [left, right] = sharedHalves("o1", "o2");
    const small: PlanVehicle = {
      name: "Kangoo",
      cargoLiters: 200,
      refrigeratedLiters: 50,
      floor: null,
    };

    const plan = planLoading(
      [stop("o1", 1, [left, bin("a"), bin("b")]), stop("o2", 2, [right])],
      small,
      BIN_GAP_DEFAULT_CM,
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
    const tight: PlanVehicle = {
      name: "Frigo",
      cargoLiters: 1000,
      refrigeratedLiters: 40,
      floor: null,
    };

    const plan = planLoading(
      [stop("o1", 1, [bin("c1", { binType: BAC_FROID }), bin("c2", { binType: BAC_FROID })])],
      tight,
      BIN_GAP_DEFAULT_CM,
    );

    expect(plan.volume).toMatchObject({ dryLiters: 0, coldLiters: 60, coldOver: true });
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["cold_over"]);
  });

  it("sans caisse réfrigérée, compte les isothermes au sec et le dit", () => {
    const dry: PlanVehicle = {
      name: "Trafic",
      cargoLiters: 1000,
      refrigeratedLiters: null,
      floor: null,
    };

    const plan = planLoading(
      [stop("o1", 1, [bin("c1", { binType: BAC_FROID })])],
      dry,
      BIN_GAP_DEFAULT_CM,
    );

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
    const unknown: PlanVehicle = {
      name: "Vélo",
      cargoLiters: null,
      refrigeratedLiters: null,
      floor: null,
    };
    const many = Array.from({ length: 40 }, (_, index) => bin(`b${String(index)}`));

    const plan = planLoading([stop("o1", 1, many)], unknown, BIN_GAP_DEFAULT_CM);

    expect(plan.volume).toMatchObject({ dryLiters: 2400, dryCapacityLiters: null, dryOver: false });
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["unknown_cargo"]);
    expect(
      planLoading([], unknown, BIN_GAP_DEFAULT_CM).warnings.map((warning) => warning.kind),
    ).toEqual(["unknown_cargo"]);
  });

  it("signale UNE fois un bac partagé à refaire, et le charge chez son propre arrêt si l'autre est ailleurs", () => {
    const partner = { orderId: "elsewhere", reference: "R-elsewhere" };
    const redo = bin("h1", { half: "left", physicalBinId: "phys_9", partner, toRedo: true });

    const plan = planLoading(
      [stop("o1", 1, [bin("a")]), stop("o2", 2, [redo])],
      ROOMY,
      BIN_GAP_DEFAULT_CM,
    );

    expect(plan.steps[0]?.bins.map((entry) => entry.bin.id)).toEqual(["h1"]);
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["bin_to_redo"]);
    expect(plan.warnings[0]?.message).toContain("H1 (partagé avec R-elsewhere)");
  });

  it("une tournée sans bac rend un plan vide, lisible", () => {
    const plan = planLoading([stop("o1", 1, [])], ROOMY, BIN_GAP_DEFAULT_CM);

    expect(plan.stacks).toEqual([]);
    expect(plan.volume).toMatchObject({ dryLiters: 0, coldLiters: 0, dryCapacityLiters: 2500 });
    expect(plan.warnings).toEqual([]);
  });
});

/** Un véhicule sec dont on connaît le plancher : ses litres en dérivent. */
function measured(lengthCm: number): PlanVehicle {
  const floor = CargoFloor.of({ lengthCm, widthCm: 100, heightCm: 100, wheelArches: null });
  return { name: "Trafic", cargoLiters: floor.volumeLiters, refrigeratedLiters: null, floor };
}

/** Trois bacs M par arrêt : une pile pleine chacun. */
function fullStops(count: number): readonly PlanStop[] {
  return Array.from({ length: count }, (_, index) =>
    stop(
      `o${String(index + 1)}`,
      index + 1,
      [1, 2, 3].map((n) => bin(`b${String(index)}_${String(n)}`)),
    ),
  );
}

describe("le plan de chargement — les piles au sol (G5, G-D4)", () => {
  it("pose le DERNIER arrêt au fond, le premier près des portes", () => {
    const plan = planLoading(fullStops(3), measured(130), BIN_GAP_DEFAULT_CM);

    expect(plan.stacks.map((stack) => [stack.stopPositions, stack.placement])).toEqual([
      [[3], expect.objectContaining({ kind: "floor", row: 1, xMm: 0, yMm: 0 })],
      [[2], expect.objectContaining({ kind: "floor", row: 1, xMm: 0, yMm: 410 })],
      [[1], expect.objectContaining({ kind: "floor", row: 2, xMm: 610, yMm: 0 })],
    ]);
    expect(plan.floor?.lengthCm).toBe(130);
    expect(plan.warnings).toEqual([]);
  });

  it("dit `floor_over` en nommant les arrêts, en PLUS de `dry_over`", () => {
    const plan = planLoading(fullStops(4), measured(70), BIN_GAP_DEFAULT_CM);

    expect(plan.stacks.map((stack) => stack.placement?.kind)).toEqual([
      "floor",
      "floor",
      "off_floor",
      "off_floor",
    ]);
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["dry_over", "floor_over"]);
    expect(plan.warnings[1]?.message).toBe(
      "2 piles ne tiennent pas au sol de « Trafic » (arrêts 1 et 2) : retirez un arrêt de la tournée ou changez de véhicule.",
    );
  });

  it("tient en litres sans tenir en forme : `floor_over` seul", () => {
    // 3 000 L pour 180 L de bacs, mais un plancher de 50 cm : aucun bac M ne s'y pose.
    const floor = CargoFloor.of({
      lengthCm: 50,
      widthCm: 30,
      heightCm: 2000 / 10,
      wheelArches: null,
    });
    const vehicle: PlanVehicle = {
      name: "Vélo",
      cargoLiters: 3000,
      refrigeratedLiters: null,
      floor,
    };

    const plan = planLoading(fullStops(1), vehicle, BIN_GAP_DEFAULT_CM);

    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["floor_over"]);
    expect(plan.warnings[0]?.message).toContain("1 pile ne tient pas au sol de « Vélo » (arrêt 1)");
  });

  /**
   * Régression (2026-10-03) : le premier arrêt montait sur une pile de son type
   * ouverte par le DERNIER arrêt, au fond, alors qu'une rangée plus proche des
   * portes était déjà ouverte — l'arrêt livré en premier finissait au fond.
   */
  it("ne monte pas sur une pile d'une rangée déjà fermée : le premier arrêt reste près des portes", () => {
    const cold = (id: string): PlanBin => bin(id, { binType: BAC_FROID });
    const plan = planLoading(
      [
        stop("o1", 1, [bin("first_m")]),
        // Cinq isothermes, sans caisse froide : deux piles qui ouvrent la rangée 2.
        stop("o2", 2, ["c1", "c2", "c3", "c4", "c5"].map(cold)),
        stop("o3", 3, [bin("last_m")]),
      ],
      measured(200),
      BIN_GAP_DEFAULT_CM,
    );

    const rowOf = (code: string): number | undefined => {
      const stackIndex = plan.steps
        .flatMap((step) => step.bins)
        .find((planned) => planned.bin.code === code)?.stackIndex;
      const placement = plan.stacks.find((stack) => stack.stackIndex === stackIndex)?.placement;
      return placement?.kind === "floor" ? placement.row : undefined;
    };
    expect(rowOf("LAST_M")).toBe(1);
    expect(rowOf("FIRST_M")).toBe(2);
  });

  /**
   * Un plancher de 105 cm de large. Le dernier arrêt ouvre une pile M au fond ;
   * l'arrêt 2 remplit la rangée 1 (X) puis la rangée 2, à ras (X + Y) ; le
   * premier arrêt a un bac M. Cohérent : sa pile neuve ouvre une rangée 3.
   * Compacté : il monte sur la pile M du fond, déjà fermée.
   */
  function tightRound(lengthCm: number): ReturnType<typeof planLoading> {
    const type = (id: string, widthCm: number): PlanBinType => ({
      id,
      name: id,
      isotherm: false,
      outerLengthMm: 600,
      outerWidthMm: widthCm * 10,
      outerHeightMm: 250,
      maxStack: 3,
    });
    const x = type("bin_x", 60);
    const y = type("bin_y", 43);
    const floor = CargoFloor.of({ lengthCm, widthCm: 105, heightCm: 100, wheelArches: null });
    return planLoading(
      [
        stop("o1", 1, [bin("first_m")]),
        stop("o2", 2, [
          ...["x1", "x2", "x3", "x4"].map((id) => bin(id, { binType: x })),
          bin("y1", { binType: y }),
        ]),
        stop("o3", 3, [bin("last_m")]),
      ],
      { name: "Trafic", cargoLiters: floor.volumeLiters, refrigeratedLiters: null, floor },
      BIN_GAP_DEFAULT_CM,
    );
  }

  const rowOfCode = (plan: ReturnType<typeof planLoading>, code: string): number | undefined => {
    const planned = plan.steps.flatMap((step) => step.bins).find((p) => p.bin.code === code);
    const placement = plan.stacks.find(
      (stack) => stack.stackIndex === planned?.stackIndex,
    )?.placement;
    return placement?.kind === "floor" ? placement.row : undefined;
  };

  it("garde le plan cohérent quand il tient : aucun bac derrière, aucune alerte", () => {
    const plan = tightRound(200);

    expect(rowOfCode(plan, "FIRST_M")).toBe(3);
    expect(plan.steps.flatMap((step) => step.bins).some((planned) => planned.behind)).toBe(false);
    expect(plan.warnings).toEqual([]);
  });

  it("compacte quand le cohérent ne tient pas : le bac monte au fond, marqué derrière, et l'alerte le dit", () => {
    // 150 cm : la rangée 3 cohérente finirait à 183 cm ; compactée, rien après 122 cm.
    const plan = tightRound(150);

    const first = plan.steps.flatMap((step) => step.bins).find((p) => p.bin.code === "FIRST_M");
    expect(first?.behind).toBe(true);
    expect(rowOfCode(plan, "FIRST_M")).toBe(1);
    expect(plan.stacks.some((stack) => stack.placement?.kind === "off_floor")).toBe(false);
    expect(plan.warnings).toEqual([
      {
        kind: "compacted",
        message:
          "Pour que tout tienne au sol, 1 bac est posé au fond, derrière d'autres (arrêt 1) : il faudra sortir des bacs pour les atteindre.",
      },
    ]);
  });

  /**
   * Régression : compacter sauvait des bacs sans tous les sauver, et l'alerte
   * disait « pour que tout tienne au sol » à côté de `floor_over` (audit
   * livraisons, § 3.4, 2026-10-07). Ce cas n'avait pas de test.
   */
  it("compacter en partie : l'alerte ne promet pas que tout tient, et `floor_over` reste", () => {
    const wide: PlanBinType = { ...BAC_M, id: "bin_x", name: "bin_x", outerWidthMm: 600 };
    const narrow: PlanBinType = { ...BAC_M, id: "bin_y", name: "bin_y", outerWidthMm: 430 };
    const floor = CargoFloor.of({ lengthCm: 124, widthCm: 105, heightCm: 100, wheelArches: null });

    const plan = planLoading(
      [
        stop(
          "o1",
          1,
          ["f1", "f2", "f3"].map((id) => bin(id)),
        ),
        stop("o2", 2, [
          ...["x1", "x2", "x3", "x4"].map((id) => bin(id, { binType: wide })),
          bin("y1", { binType: narrow }),
        ]),
        stop("o3", 3, [bin("last")]),
      ],
      { name: "Trafic", cargoLiters: floor.volumeLiters, refrigeratedLiters: null, floor },
      BIN_GAP_DEFAULT_CM,
    );

    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["floor_over", "compacted"]);
    const compacted = plan.warnings.find((warning) => warning.kind === "compacted");
    expect(compacted?.message.startsWith("Pour en faire tenir davantage au sol")).toBe(true);
  });

  it("garde le cohérent et `floor_over` quand compacter ne sauve aucun bac", () => {
    const plan = planLoading(fullStops(4), measured(70), BIN_GAP_DEFAULT_CM);

    expect(plan.steps.flatMap((step) => step.bins).some((planned) => planned.behind)).toBe(false);
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["dry_over", "floor_over"]);
  });

  it("sans plancher connu, aucune position ni `floor_over`", () => {
    const plan = planLoading(fullStops(2), ROOMY, BIN_GAP_DEFAULT_CM);

    expect(plan.floor).toBeNull();
    expect(plan.stacks.map((stack) => stack.placement)).toEqual([null, null]);
    expect(plan.warnings).toEqual([]);
  });
});

/**
 * 2026-10-07 : un type de bac se mesure au millimètre, un véhicule au
 * centimètre. Le plancher se convertit ×10 ; le bac, jamais divisé.
 */
describe("le plan de chargement — au millimètre (bac en mm, véhicule en cm)", () => {
  const MANNE: PlanBinType = {
    id: "bin_manne",
    name: "Manne à pain",
    isotherm: false,
    outerLengthMm: 665,
    outerWidthMm: 460,
    outerHeightMm: 715,
    maxStack: 1,
  };
  const vehicleOf = (lengthCm: number, widthCm: number): PlanVehicle => {
    const floor = CargoFloor.of({ lengthCm, widthCm, heightCm: 100, wheelArches: null });
    return { name: "Juste", cargoLiters: floor.volumeLiters, refrigeratedLiters: null, floor };
  };
  const manneStop = (): readonly PlanStop[] => [stop("o1", 1, [bin("manne", { binType: MANNE })])];

  it("une manne de 665 mm (+ 10 mm de jeu) tient dans 68 cm, à sa cote exacte", () => {
    const plan = planLoading(manneStop(), vehicleOf(68, 48), BIN_GAP_DEFAULT_CM);

    expect(plan.stacks[0]?.placement).toEqual({
      kind: "floor",
      row: 1,
      xMm: 0,
      yMm: 0,
      depthMm: 665,
      widthMm: 460,
      orientation: "length",
      overArch: null,
    });
  });

  it("et ne tient pas dans 67 cm : un arrondi au centimètre l'y aurait fait entrer", () => {
    const plan = planLoading(manneStop(), vehicleOf(67, 48), BIN_GAP_DEFAULT_CM);

    expect(plan.stacks[0]?.placement).toEqual({ kind: "off_floor" });
  });

  it("compte son volume en mm³ : 218 718 500 mm³ → 219 L au-dessus", () => {
    expect(planLoading(manneStop(), vehicleOf(68, 48), BIN_GAP_DEFAULT_CM).volume.dryLiters).toBe(
      219,
    );
  });
});
