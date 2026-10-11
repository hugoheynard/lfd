import type { PaletteStripColumnView } from '@lfd/pim-contracts';

/** Les fines bandes des écarts, en px CSS. */
const OUTLIER_PX = 2;
const HATCH_PX = 4;

/** Le cadre où l'on peint : la taille en px CSS, et les deux teintes du hachuré. */
export interface StripFrame {
  readonly width: number;
  readonly height: number;
  readonly hatch: readonly string[];
}

/** Ce que la peinture demande d'un contexte 2D — rien de plus. */
export type StripPainter = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>;

/**
 * **Peint la frise** : chaque colonne empile ses dominantes à proportion de
 * leur part, puis ses écarts en fines bandes ; une colonne sans palette connue
 * est hachurée.
 */
export function paintStrip(
  context: StripPainter,
  columns: readonly PaletteStripColumnView[],
  frame: StripFrame,
): void {
  const { width, height, hatch } = frame;
  const step = columns.length === 0 ? 0 : width / columns.length;
  columns.forEach((column, index) => {
    const x = index * step;
    const outliers = column.palette.filter((swatch) => swatch.outlier);
    const dominants = column.palette.filter((swatch) => !swatch.outlier);
    if (dominants.length === 0) {
      // Aucune palette connue sur la plage : une colonne hachurée.
      for (let y = 0; y < height; y += HATCH_PX) {
        context.fillStyle = hatch[(y / HATCH_PX) % 2] ?? '';
        context.fillRect(x, y, step, HATCH_PX);
      }
      return;
    }
    const bandsHeight = height - outliers.length * OUTLIER_PX;
    const total = dominants.reduce((sum, swatch) => sum + swatch.share, 0) || 1;
    let y = 0;
    for (const swatch of dominants) {
      const bandHeight = (swatch.share / total) * bandsHeight;
      context.fillStyle = swatch.hex;
      context.fillRect(x, y, step, bandHeight);
      y += bandHeight;
    }
    for (const swatch of outliers) {
      context.fillStyle = swatch.hex;
      context.fillRect(x, y, step, OUTLIER_PX);
      y += OUTLIER_PX;
    }
  });
}
