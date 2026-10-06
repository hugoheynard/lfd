import { BinFormat } from "../../../value-objects/bin-format.js";
import { CargoFloor, type CargoFloorInput } from "../../../value-objects/cargo-floor.js";
import { geometryOfFormat } from "../format-geometry.js";
import { type FormatLayout, maximizeFormat } from "../maximize-format.js";

type RowCm = Omit<FormatLayout["rows"][number], "fromMm" | "depthMm"> & {
  readonly fromCm: number;
  readonly depthCm: number;
};

/**
 * Le calcul rend des millimètres ; ces cas sont écrits en centimètres
 * entiers (un format de l'assistant), relus ici en cm.
 */
const maximize = (
  floor: CargoFloor,
  binFormat: BinFormat,
  gapCm: number,
): Omit<FormatLayout, "rows"> & { readonly rows: readonly RowCm[] } => {
  const layout = maximizeFormat(floor, geometryOfFormat(binFormat), gapCm);
  return {
    ...layout,
    rows: layout.rows.map(({ fromMm, depthMm, ...row }) => ({
      ...row,
      fromCm: fromMm / 10,
      depthCm: depthMm / 10,
    })),
  };
};

const floorOf = (input: CargoFloorInput): CargoFloor => CargoFloor.of(input);
const format = (
  outer: readonly [number, number, number],
  maxStack: number,
  inner: readonly [number, number, number] = outer,
): BinFormat =>
  BinFormat.of({
    outer: { lengthMm: outer[0] * 10, widthMm: outer[1] * 10, heightMm: outer[2] * 10 },
    inner: { lengthMm: inner[0] * 10, widthMm: inner[1] * 10, heightMm: inner[2] * 10 },
    maxStack,
  });

/** Une rangée sans bac au-dessus d'un passage — le cas de tout plancher sans hauteur de passage. */
const plain = (
  fromCm: number,
  depthCm: number,
  count: number,
  orientation: "length" | "turned",
) => ({
  fromCm,
  depthCm,
  count,
  orientation,
  overArchCount: 0,
  overArchFromLevel: null,
});

describe("maximizeFormat — calculs faits à la main", () => {
  it("tourner la dernière rangée gagne un bac", () => {
    // 100 × 100, bac 60 × 40, jeu 0.
    // Tout en long : une rangée de 60 cm, ⌊100 ÷ 40⌋ = 2 ; 40 cm restent vides → 2.
    // Tout tourné : deux rangées de 40 cm, ⌊100 ÷ 60⌋ = 1 chacune → 2.
    // En long puis tourné : 2 sur [0, 60) + 1 sur [60, 100) → 3.
    const layout = maximize(
      floorOf({ lengthCm: 100, widthCm: 100, heightCm: 50, wheelArches: null }),
      format([60, 40, 30], 1),
      0,
    );
    expect(layout.floorCount).toBe(3);
    expect(layout.rows).toEqual([
      { ...plain(0, 60, 2, "length"), total: 2 },
      { ...plain(60, 40, 1, "turned"), total: 1 },
    ]);
  });

  it("le passage de roue coûte une rangée entière", () => {
    // 110 × 100, bac carré 50 × 50, jeu 0 : sans passage, [0, 50) et [50, 100) → 2 + 2 = 4.
    // Passage [40, 60), saillie 30 : il reste 40 cm entre les passages, < 50 → 0 bac
    // sur toute tranche qui le touche. Seule [60, 110) l'évite → 2.
    const rectangle = floorOf({ lengthCm: 110, widthCm: 100, heightCm: 50, wheelArches: null });
    const arched = floorOf({
      lengthCm: 110,
      widthCm: 100,
      heightCm: 50,
      wheelArches: { lengthCm: 20, protrusionCm: 30, fromBackCm: 40 },
    });
    expect(maximize(rectangle, format([50, 50, 30], 1), 0).floorCount).toBe(4);
    const layout = maximize(arched, format([50, 50, 30], 1), 0);
    expect(layout.floorCount).toBe(2);
    expect(layout.rows).toEqual([{ ...plain(60, 50, 2, "length"), total: 2 }]);
  });

  it("rien ne tient : un bac plus long que le plancher dans les deux sens", () => {
    const layout = maximize(
      floorOf({ lengthCm: 100, widthCm: 100, heightCm: 100, wheelArches: null }),
      format([120, 110, 30], 3),
      1,
    );
    expect(layout).toMatchObject({ floorCount: 0, total: 0, usefulLiters: 0, rows: [] });
  });

  it("rien ne tient : un bac plus haut que le plafond n'a aucun étage", () => {
    const layout = maximize(
      floorOf({ lengthCm: 100, widthCm: 100, heightCm: 30, wheelArches: null }),
      format([40, 30, 31], 3),
      1,
    );
    // Au sol, 41 × 31 : deux rangées en long de ⌊100 ÷ 31⌋ = 3 → 6 ; mais ⌊30 ÷ 31⌋ = 0 étage.
    expect(layout).toMatchObject({ floorCount: 6, levels: 0, total: 0, heightLimit: "ceiling" });
  });

  it("le jeu s'ajoute à l'empreinte en long et en large", () => {
    // 120 × 80, bac 60 × 40 : sans jeu, 2 rangées de ⌊80 ÷ 40⌋ = 2 → 4.
    // Jeu 1 : empreinte 61 × 41 → une rangée de ⌊80 ÷ 41⌋ = 1, et 59 cm ne prennent
    // ni 61 ni un tourné (⌊80 ÷ 61⌋ = 1 sur 41 cm) : 1 + 1 = 2.
    const floor = floorOf({ lengthCm: 120, widthCm: 80, heightCm: 50, wheelArches: null });
    expect(maximize(floor, format([60, 40, 30], 1), 0).floorCount).toBe(4);
    expect(maximize(floor, format([60, 40, 30], 1), 1).floorCount).toBe(2);
  });

  it("la camionnette 290 × 166 × 139, passages 90/20/60, bacs 60 × 40 × 32 pile 5", () => {
    // Jeu 1 → empreinte 61 × 41 en long, 41 × 61 tournée. Passage [60, 150),
    // largeur libre 166 − 2 × 20 = 126 sur toute tranche qui le touche.
    //   en long : ⌊166 ÷ 41⌋ = 4 hors passage, ⌊126 ÷ 41⌋ = 3 contre lui ;
    //   tourné  : ⌊166 ÷ 61⌋ = 2 hors passage, ⌊126 ÷ 61⌋ = 2 contre lui.
    // Avant le passage, 60 cm : seul un tourné [0, 41) tient hors passage → 2.
    // Après [150, 290), 140 cm : deux rangées en long (122 cm) → 8 ; trois
    //   rangées demanderaient 123 cm au moins et n'en donnent que 6.
    // Entre les deux, [41, 168) = 127 cm contre le passage : deux en long → 3 + 3.
    // Sol : 2 + 6 + 8 = 16. Renoncer à une rangée d'après pour une troisième
    //   contre le passage donne 2 + 9 + 4 = 15 : moins.
    // Étages : ⌊139 ÷ 32⌋ = 4 < 5 → le plafond limite. Total 16 × 4 = 64.
    // Intérieur 56 × 36 × 30 = 60 480 cm³ ; 64 × 60 480 = 3 870 720 cm³ → 3 870 L.
    // Véhicule 290 × 166 × 139 = 6 691 460 cm³ → ⌊57,84 %⌋ = 57 %.
    const layout = maximize(
      floorOf({
        lengthCm: 290,
        widthCm: 166,
        heightCm: 139,
        wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 60 },
      }),
      format([60, 40, 32], 5, [56, 36, 30]),
      1,
    );
    expect(layout).toMatchObject({
      floorCount: 16,
      levels: 4,
      total: 64,
      usefulLiters: 3870,
      vehiclePercent: 57,
      heightLimit: "ceiling",
    });
    // À égalité (16), le calcul pose d'abord : il rend l'autre rangement à 16,
    // celui qui commence contre la cloison — 3 + 3 contre le passage, un tourné
    // [122, 163) contre lui (2), puis deux en long hors passage (4 + 4).
    expect(layout.rows).toEqual([
      { ...plain(0, 61, 3, "length"), total: 12 },
      { ...plain(61, 61, 3, "length"), total: 12 },
      { ...plain(122, 41, 2, "turned"), total: 8 },
      { ...plain(163, 61, 4, "length"), total: 16 },
      { ...plain(224, 61, 4, "length"), total: 16 },
    ]);
  });

  it("la pile limite quand le plafond laisse plus d'étages", () => {
    const layout = maximize(
      floorOf({ lengthCm: 290, widthCm: 166, heightCm: 139, wheelArches: null }),
      format([60, 40, 32], 3),
      1,
    );
    expect(layout).toMatchObject({ levels: 3, heightLimit: "stack" });
  });
});

describe("maximizeFormat — par-dessus les passages de roue (G-D2 bis)", () => {
  const van = (archHeightCm: number | null): CargoFloor =>
    floorOf({
      lengthCm: 290,
      widthCm: 166,
      heightCm: 139,
      wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: archHeightCm },
    });
  const binL = format([60, 40, 32], 5, [56, 36, 30]);

  it("la camionnette 290 × 166 × 139, passages hauts de 30 : 70 bacs au lieu de 64", () => {
    // Étages ⌊139 ÷ 32⌋ = 4 (la pile 5 ne limite pas). k₀ = ⌈30 ÷ 32⌉ = 1 : le jeu
    // ne compte pas en hauteur, un bac de 32 dépasse déjà le passage au premier étage.
    // Par rangée (empreinte 61 × 41, jeu 1) :
    //   en long hors passage : 4 × 4 = 16 ;
    //   en long contre lui   : 3 × 4 + (4 − 3) × (4 − 1) = 15 ;
    //   tourné hors passage  : 2 × 4 = 8 ;  tourné contre lui : 2 × 4 + 0 = 8.
    // Au plus ⌊290 ÷ 61⌋ = 4 rangées en long (244 cm) ; il reste 46 cm, un tourné (41).
    // Seules deux rangées en long évitent le passage ([150, 290) = 140 cm) ;
    // le tourné tient avant lui ([0, 41) ⊂ [0, 60)). Total 8 + 15 + 15 + 16 + 16 = 70.
    // Trois en long + deux tournés : au plus 16 + 16 + 15 + 8 + 8 = 63. Moins.
    // Au sol : 2 + 3 + 3 + 4 + 4 = 16, comme avant — seul le total monte.
    // Intérieur 70 × 60 480 = 4 233 600 cm³ → 4 233 L ; ÷ 6 691 460 → ⌊63,27 %⌋ = 63 %.
    const layout = maximize(van(30), binL, 1);
    expect(layout).toMatchObject({
      floorCount: 16,
      levels: 4,
      total: 70,
      usefulLiters: 4233,
      vehiclePercent: 63,
    });
    expect(layout.rows.reduce((sum, row) => sum + row.overArchCount, 0)).toBe(2);
    for (const row of layout.rows.filter((r) => r.overArchCount > 0)) {
      expect(row).toMatchObject({
        orientation: "length",
        count: 3,
        overArchFromLevel: 1,
        total: 15,
      });
    }
  });

  // Une rangée seule, en long, sur un passage qui court tout le plancher :
  // 61 × 166 × 139, saillie 20 → 3 au sol, 1 au-dessus ; 4 étages. Tourné : 2 × 4 = 8.
  const strip = (archHeightCm: number | null): CargoFloor =>
    floorOf({
      lengthCm: 61,
      widthCm: 166,
      heightCm: 139,
      wheelArches: { lengthCm: 61, protrusionCm: 20, fromBackCm: 0, heightCm: archHeightCm },
    });

  it("un passage haut d'exactement deux bacs : le latéral commence au troisième étage", () => {
    // k₀ = ⌈64 ÷ 32⌉ = 2 : le bac latéral pose sur le passage à 64 cm pile.
    // 3 × 4 + 1 × (4 − 2) = 14. À 65 cm, k₀ = 3 → 3 × 4 + 1 × 1 = 13.
    const exact = maximize(strip(64), binL, 1);
    expect(exact.total).toBe(14);
    expect(exact.rows).toEqual([
      {
        fromCm: 0,
        depthCm: 61,
        count: 3,
        orientation: "length",
        overArchCount: 1,
        overArchFromLevel: 2,
        total: 14,
      },
    ]);
    expect(maximize(strip(65), binL, 1).total).toBe(13);
  });

  it("un passage trop haut : aucun latéral ne commence", () => {
    // k₀ = ⌈128 ÷ 32⌉ = 4 = étages → max(0, 4 − 4) = 0 : 3 × 4 = 12, rien au-dessus.
    const layout = maximize(strip(128), binL, 1);
    expect(layout).toMatchObject({ floorCount: 3, levels: 4, total: 12 });
    expect(layout.rows[0]).toMatchObject({ overArchCount: 0, overArchFromLevel: null, total: 12 });
  });

  /** Régression : sans hauteur mesurée, rien ne doit monter au-dessus du passage. */
  it("sans hauteur de passage, le résultat d'avant : 16 × 4 = 64, aucun latéral", () => {
    const layout = maximize(van(null), binL, 1);
    expect(layout).toMatchObject({ floorCount: 16, levels: 4, total: 64, usefulLiters: 3870 });
    expect(
      layout.rows.map(({ fromCm, count, orientation }) => ({ fromCm, count, orientation })),
    ).toEqual([
      { fromCm: 0, count: 3, orientation: "length" },
      { fromCm: 61, count: 3, orientation: "length" },
      { fromCm: 122, count: 2, orientation: "turned" },
      { fromCm: 163, count: 4, orientation: "length" },
      { fromCm: 224, count: 4, orientation: "length" },
    ]);
    expect(
      layout.rows.every((row) => row.overArchCount === 0 && row.overArchFromLevel === null),
    ).toBe(true);
  });
});
