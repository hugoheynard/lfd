import { imagePaletteSchema, mediaPalettePayloadSchema, PALETTE_MAX_SWATCHES } from "../index.js";

const swatch = (hex: string, share: number, outlier = false) => ({ hex, share, outlier });

describe("la palette d'une image (L9)", () => {
  it("accepte des dominantes qui couvrent l'image, plus des écarts", () => {
    const palette = [swatch("#aa0000", 0.6), swatch("#00BB00", 0.4), swatch("#0000cc", 0.02, true)];
    expect(imagePaletteSchema.safeParse(palette).success).toBe(true);
  });

  it("refuse un hex mal formé, une part hors [0, 1], une liste vide ou trop longue", () => {
    expect(imagePaletteSchema.safeParse([swatch("red", 1)]).success).toBe(false);
    expect(imagePaletteSchema.safeParse([swatch("#abc", 1)]).success).toBe(false);
    expect(imagePaletteSchema.safeParse([swatch("#aaaaaa", 1.2)]).success).toBe(false);
    expect(imagePaletteSchema.safeParse([]).success).toBe(false);
    const tooMany = Array.from({ length: PALETTE_MAX_SWATCHES + 1 }, () =>
      swatch("#aaaaaa", 1 / (PALETTE_MAX_SWATCHES + 1)),
    );
    expect(imagePaletteSchema.safeParse(tooMany).success).toBe(false);
  });

  it("refuse des dominantes dont la somme sort de [0,95 ; 1,05]", () => {
    expect(imagePaletteSchema.safeParse([swatch("#aaaaaa", 0.5)]).success).toBe(false);
    // Les écarts ne comptent pas dans la somme.
    expect(
      imagePaletteSchema.safeParse([swatch("#aaaaaa", 0.5), swatch("#bbbbbb", 0.5, true)]).success,
    ).toBe(false);
  });

  it("exige l'URL avec la palette au rattrapage", () => {
    expect(mediaPalettePayloadSchema.safeParse({ palette: [swatch("#aaaaaa", 1)] }).success).toBe(
      false,
    );
  });
});
