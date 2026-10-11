import { PALETTE_MAX_SWATCHES } from "@lfd/pim-contracts";

import { imagePalette, InvalidImagePaletteError } from "../image-palette.js";

const swatch = (hex: string, share: number, outlier = false) => ({ hex, share, outlier });

describe("imagePalette", () => {
  it("garde une palette valide et range ses couleurs en minuscules", () => {
    const palette = imagePalette([
      swatch("#AA0000", 0.7),
      swatch("#00bb00", 0.3),
      swatch("#0000cc", 0.01, true),
    ]);
    expect(palette).toEqual([
      swatch("#aa0000", 0.7),
      swatch("#00bb00", 0.3),
      swatch("#0000cc", 0.01, true),
    ]);
  });

  it("tolère un arrondi de la somme des dominantes", () => {
    expect(() => imagePalette([swatch("#aaaaaa", 0.52), swatch("#bbbbbb", 0.52)])).not.toThrow();
  });

  it.each([
    ["un hex mal formé", [swatch("rouge", 1)]],
    ["un hex à trois chiffres", [swatch("#abc", 1)]],
    ["une part négative", [swatch("#aaaaaa", 1), swatch("#bbbbbb", -0.1, true)]],
    ["une part au-delà de 1", [swatch("#aaaaaa", 1.5)]],
    ["une part non finie", [swatch("#aaaaaa", Number.NaN)]],
    ["aucune couleur", []],
    [
      "plus de huit couleurs",
      Array.from({ length: PALETTE_MAX_SWATCHES + 1 }, () => swatch("#aaaaaa", 1 / 9)),
    ],
    [
      "des dominantes qui ne couvrent pas l'image",
      [swatch("#aaaaaa", 0.5), swatch("#bbbbbb", 0.5, true)],
    ],
    ["des dominantes qui débordent", [swatch("#aaaaaa", 0.6), swatch("#bbbbbb", 0.6)]],
  ])("refuse %s", (_case, raw) => {
    expect(() => imagePalette(raw)).toThrow(InvalidImagePaletteError);
  });
});
