import { type ColumnWidthStep, MAIL_BODY_WIDTH_PX, twelfthsOf } from "@lfd/mail-blocks";

/** L'espace entre deux colonnes, en pixels, à la largeur du corps. */
export const COLUMN_GUTTER_PX = 12;

const ROW_TWELFTHS = 12;
const PERCENT_SCALE = 100;
const HUNDREDTHS = 100;

/** Une ligne de colonnes : la largeur de chaque colonne et de chaque gouttière, en pour cent. */
export interface ColumnRowGeometry {
  readonly columns: readonly number[];
  /** Une de moins que de colonnes : la gouttière `i` sépare la colonne `i` de la suivante. */
  readonly gutters: readonly number[];
}

function percentOf(px: number): number {
  return Math.round((px / MAIL_BODY_WIDTH_PX) * PERCENT_SCALE * HUNDREDTHS) / HUNDREDTHS;
}

/**
 * La géométrie d'une ligne de colonnes, calculée sur la largeur du corps
 * (`MAIL_BODY_WIDTH_PX`) puis écrite en pour cent pour rester fluide.
 *
 * Régression du 2026-11-08 (« deux photos en 50/50 n'ont pas la même
 * hauteur ») : la gouttière était portée par la colonne de gauche, dont le
 * contenu était donc 12 px plus étroit. Ici, la gouttière est une cellule à
 * part, et deux colonnes de même cran reçoivent EXACTEMENT la même largeur :
 * chacune prend la partie entière de sa part de la place utile, et ce que
 * l'arrondi laisse (quelques pixels) va aux gouttières — la dernière
 * gouttière fermant la ligne à 100 % tout juste.
 */
export function columnRowGeometry(widths: readonly ColumnWidthStep[]): ColumnRowGeometry {
  const gutterCount = Math.max(0, widths.length - 1);
  const usable = MAIL_BODY_WIDTH_PX - gutterCount * COLUMN_GUTTER_PX;
  const columnsPx = widths.map((step) => Math.floor((usable * twelfthsOf(step)) / ROW_TWELFTHS));
  const columns = columnsPx.map(percentOf);
  if (gutterCount === 0) {
    return { columns, gutters: [] };
  }
  const leftoverPx = usable - columnsPx.reduce((sum, px) => sum + px, 0);
  const gutterPx = COLUMN_GUTTER_PX + Math.floor(leftoverPx / gutterCount);
  const gutters = Array.from({ length: gutterCount - 1 }, () => percentOf(gutterPx));
  const taken = [...columns, ...gutters].reduce((sum, percent) => sum + percent, 0);
  const closing = Math.round((PERCENT_SCALE - taken) * HUNDREDTHS) / HUNDREDTHS;
  return { columns, gutters: [...gutters, closing] };
}
