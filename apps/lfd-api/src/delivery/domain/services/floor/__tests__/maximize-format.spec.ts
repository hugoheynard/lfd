import { BinFormat } from "../../../value-objects/bin-format.js";
import { CargoFloor, type CargoFloorInput } from "../../../value-objects/cargo-floor.js";
import { maximizeFormat } from "../maximize-format.js";

const floorOf = (input: CargoFloorInput): CargoFloor => CargoFloor.of(input);
const format = (
  outer: readonly [number, number, number],
  maxStack: number,
  inner: readonly [number, number, number] = outer,
): BinFormat =>
  BinFormat.of({
    outer: { lengthCm: outer[0], widthCm: outer[1], heightCm: outer[2] },
    inner: { lengthCm: inner[0], widthCm: inner[1], heightCm: inner[2] },
    maxStack,
  });

describe("maximizeFormat — calculs faits à la main", () => {
  it("tourner la dernière rangée gagne un bac", () => {
    // 100 × 100, bac 60 × 40, jeu 0.
    // Tout en long : une rangée de 60 cm, ⌊100 ÷ 40⌋ = 2 ; 40 cm restent vides → 2.
    // Tout tourné : deux rangées de 40 cm, ⌊100 ÷ 60⌋ = 1 chacune → 2.
    // En long puis tourné : 2 sur [0, 60) + 1 sur [60, 100) → 3.
    const layout = maximizeFormat(
      floorOf({ lengthCm: 100, widthCm: 100, heightCm: 50, wheelArches: null }),
      format([60, 40, 30], 1),
      0,
    );
    expect(layout.floorCount).toBe(3);
    expect(layout.rows).toEqual([
      { fromCm: 0, depthCm: 60, count: 2, orientation: "length" },
      { fromCm: 60, depthCm: 40, count: 1, orientation: "turned" },
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
    expect(maximizeFormat(rectangle, format([50, 50, 30], 1), 0).floorCount).toBe(4);
    const layout = maximizeFormat(arched, format([50, 50, 30], 1), 0);
    expect(layout.floorCount).toBe(2);
    expect(layout.rows).toEqual([{ fromCm: 60, depthCm: 50, count: 2, orientation: "length" }]);
  });

  it("rien ne tient : un bac plus long que le plancher dans les deux sens", () => {
    const layout = maximizeFormat(
      floorOf({ lengthCm: 100, widthCm: 100, heightCm: 100, wheelArches: null }),
      format([120, 110, 30], 3),
      1,
    );
    expect(layout).toMatchObject({ floorCount: 0, total: 0, usefulLiters: 0, rows: [] });
  });

  it("rien ne tient : un bac plus haut que le plafond n'a aucun étage", () => {
    const layout = maximizeFormat(
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
    expect(maximizeFormat(floor, format([60, 40, 30], 1), 0).floorCount).toBe(4);
    expect(maximizeFormat(floor, format([60, 40, 30], 1), 1).floorCount).toBe(2);
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
    const layout = maximizeFormat(
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
      { fromCm: 0, depthCm: 61, count: 3, orientation: "length" },
      { fromCm: 61, depthCm: 61, count: 3, orientation: "length" },
      { fromCm: 122, depthCm: 41, count: 2, orientation: "turned" },
      { fromCm: 163, depthCm: 61, count: 4, orientation: "length" },
      { fromCm: 224, depthCm: 61, count: 4, orientation: "length" },
    ]);
  });

  it("la pile limite quand le plafond laisse plus d'étages", () => {
    const layout = maximizeFormat(
      floorOf({ lengthCm: 290, widthCm: 166, heightCm: 139, wheelArches: null }),
      format([60, 40, 32], 3),
      1,
    );
    expect(layout).toMatchObject({ levels: 3, heightLimit: "stack" });
  });
});
