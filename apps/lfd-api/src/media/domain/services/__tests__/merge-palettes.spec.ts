import { deltaE76, hexOf, labOf } from "../lab-color.js";
import { mergePalettes } from "../merge-palettes.js";

const dominantTotal = (palette: readonly { share: number; outlier: boolean }[]): number =>
  palette.filter((swatch) => !swatch.outlier).reduce((sum, swatch) => sum + swatch.share, 0);

describe("Lab", () => {
  it("fait l'aller-retour hex → Lab → hex sans dériver", () => {
    for (const hex of ["#000000", "#ffffff", "#aa3300", "#0044ff", "#7f7f7f"]) {
      expect(hexOf(labOf(hex))).toBe(hex);
    }
  });

  it("mesure une distance nulle entre une couleur et elle-même", () => {
    expect(deltaE76(labOf("#aa3300"), labOf("#aa3300"))).toBe(0);
  });
});

describe("mergePalettes — la palette d'une colonne de frise", () => {
  it("rend une palette vide sans aucune image peinte", () => {
    expect(mergePalettes([])).toEqual([]);
  });

  it("rend la palette d'une image seule, à l'arrondi près", () => {
    const merged = mergePalettes([
      [
        { hex: "#aa3300", share: 0.6, outlier: false },
        { hex: "#ffeedd", share: 0.4, outlier: false },
        { hex: "#0044ff", share: 0.03, outlier: true },
      ],
    ]);
    expect(merged).toEqual([
      { hex: "#aa3300", share: expect.closeTo(0.6, 6) as number, outlier: false },
      { hex: "#ffeedd", share: expect.closeTo(0.4, 6) as number, outlier: false },
      { hex: "#0044ff", share: expect.closeTo(0.03, 6) as number, outlier: true },
    ]);
  });

  it("fusionne deux couleurs proches de deux images, moyenne pondérée", () => {
    const merged = mergePalettes([
      [{ hex: "#aa3300", share: 1, outlier: false }],
      [{ hex: "#ac3502", share: 1, outlier: false }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.share).toBeCloseTo(1, 6);
    expect(deltaE76(labOf(merged[0]?.hex ?? ""), labOf("#ab3401"))).toBeLessThan(1);
  });

  it("garde séparées deux couleurs éloignées, pondérées par image", () => {
    const merged = mergePalettes([
      [{ hex: "#000000", share: 1, outlier: false }],
      [
        { hex: "#ffffff", share: 0.5, outlier: false },
        { hex: "#000000", share: 0.5, outlier: false },
      ],
    ]);
    expect(merged.map((swatch) => swatch.hex)).toEqual(["#000000", "#ffffff"]);
    expect(merged[0]?.share).toBeCloseTo(0.75, 6);
    expect(merged[1]?.share).toBeCloseTo(0.25, 6);
  });

  it("ne garde que cinq dominantes, renormalisées à 1", () => {
    const hexes = ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"];
    const merged = mergePalettes([
      hexes.map((hex) => ({ hex, share: 1 / hexes.length, outlier: false })),
    ]);
    expect(merged).toHaveLength(5);
    expect(dominantTotal(merged)).toBeCloseTo(1, 6);
  });

  it("garde les trois écarts les plus fréquents, fusionnés par proximité", () => {
    const outlier = (hex: string) => ({ hex, share: 0.02, outlier: true });
    const base = { hex: "#7f7f7f", share: 1, outlier: false };
    const merged = mergePalettes([
      [base, outlier("#ff0000"), outlier("#00ff00"), outlier("#0000ff")],
      [base, outlier("#fe0101"), outlier("#00ff00"), outlier("#ffff00")],
      [base, outlier("#ff0000"), outlier("#ff00ff")],
    ]);
    const outliers = merged.filter((swatch) => swatch.outlier);
    expect(outliers).toHaveLength(3);
    expect(deltaE76(labOf(outliers[0]?.hex ?? ""), labOf("#ff0000"))).toBeLessThan(2);
    expect(outliers[1]?.hex).toBe("#00ff00");
    expect(outliers[0]?.share).toBeCloseTo(0.02, 6);
  });

  it("rend une palette conforme au contrat d'une image : ≤ 8, dominantes à 1", () => {
    const merged = mergePalettes([
      [
        { hex: "#102030", share: 0.97, outlier: false },
        { hex: "#ff8800", share: 0.05, outlier: true },
      ],
      [{ hex: "#a0b0c0", share: 1.0, outlier: false }],
    ]);
    expect(merged.length).toBeLessThanOrEqual(8);
    expect(dominantTotal(merged)).toBeCloseTo(1, 6);
    for (const swatch of merged) {
      expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
