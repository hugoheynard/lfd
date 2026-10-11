import { PALETTE_LIMITS, imagePaletteSchema } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { deltaE76, hexToLab, rgbToHex } from './color-math';
import { OUTLIER_MAX, extractPalette } from './palette-extract';

type Rgba = readonly [number, number, number, number];

/** Des pixels : chaque couleur répétée `count` fois. */
function pixels(...runs: readonly (readonly [Rgba, number])[]): Uint8ClampedArray {
  const values: number[] = [];
  for (const [color, count] of runs) {
    for (let index = 0; index < count; index += 1) {
      values.push(...color);
    }
  }
  return new Uint8ClampedArray(values);
}

/** Un dégradé de beiges proches : une même couleur pour l'œil. */
function beiges(count: number): [Rgba, number][] {
  return Array.from({ length: count }, (_, index) => [[200 + (index % 20), 180, 150, 255], 50]);
}

const RED: Rgba = [220, 20, 30, 255];
const BLUE: Rgba = [20, 40, 220, 255];

describe('la palette d’une image', () => {
  it('rend une seule dominante pour une image unie', () => {
    const palette = extractPalette(pixels([[90, 120, 60, 255], 4096]));

    expect(palette).toEqual([{ hex: '#5a783c', share: 1, outlier: false }]);
  });

  it('est déterministe : les mêmes pixels rendent la même palette', () => {
    const image = pixels(...beiges(40), [RED, 300], [BLUE, 80]);

    expect(extractPalette(image)).toEqual(extractPalette(image));
  });

  it('ignore les pixels transparents', () => {
    const palette = extractPalette(pixels([[255, 0, 0, 0], 3000], [[10, 10, 10, 255], 100]));

    expect(palette).toEqual([{ hex: '#0a0a0a', share: 1, outlier: false }]);
  });

  it('rend null quand aucun pixel n’est opaque', () => {
    expect(extractPalette(pixels([[255, 255, 255, 10], 64]))).toBeNull();
  });

  it('respecte le contrat : parts des dominantes dans la tolérance du serveur', () => {
    const palette = extractPalette(
      pixels(...beiges(40), [RED, 300], [BLUE, 300], [[20, 160, 40, 255], 300]),
    );

    expect(imagePaletteSchema.safeParse(palette).success).toBe(true);
    const total = (palette ?? [])
      .filter((swatch) => !swatch.outlier)
      .reduce((sum, swatch) => sum + swatch.share, 0);
    expect(total).toBeGreaterThanOrEqual(PALETTE_LIMITS.dominantShareMin);
    expect(total).toBeLessThanOrEqual(PALETTE_LIMITS.dominantShareMax);
    expect((palette ?? []).length).toBeLessThanOrEqual(PALETTE_LIMITS.maxSwatches);
  });

  it('marque en écart une couleur lointaine et présente, absorbée par les dominantes', () => {
    // Cinq familles franches et larges prennent les cinq dominantes ; le
    // rouge (2 %) est assez présent et assez loin pour être un écart.
    const families: [Rgba, number][] = [
      [[245, 240, 230, 255], 2000],
      [[30, 30, 30, 255], 2000],
      [[40, 150, 60, 255], 2000],
      [[BLUE[0], BLUE[1], BLUE[2], 255], 2000],
      [[230, 200, 40, 255], 2000],
    ];
    const palette = extractPalette(pixels(...families, [RED, 130])) ?? [];
    const dominants = palette.filter((swatch) => !swatch.outlier);
    const outliers = palette.filter((swatch) => swatch.outlier);

    for (const outlier of outliers) {
      expect(outlier.share).toBeGreaterThanOrEqual(0.01);
      for (const dominant of dominants) {
        expect(deltaE76(hexToLab(outlier.hex), hexToLab(dominant.hex))).toBeGreaterThan(25);
      }
    }
    expect(outliers.map((outlier) => outlier.hex)).toContain(rgbToHex(220, 20, 30));
    expect(outliers.length).toBeLessThanOrEqual(OUTLIER_MAX);
  });

  it('ne fait pas un écart d’une couleur sous 1 % de l’image', () => {
    const palette = extractPalette(pixels([[200, 190, 170, 255], 5000], [BLUE, 10])) ?? [];

    expect(palette.some((swatch) => swatch.outlier && swatch.hex === rgbToHex(20, 40, 220))).toBe(
      false,
    );
  });
});
