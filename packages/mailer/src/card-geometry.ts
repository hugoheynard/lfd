import { MAIL_BODY_GUTTER_PX } from "@lfd/mail-blocks";

/**
 * Les marges de la cellule du corps de la carte, en pixels. Les largeurs
 * (carte, bordure, marges latérales) viennent de `@lfd/mail-blocks`, que la
 * copie des images lit aussi ; le haut et le bas ne concernent que le rendu.
 */
export const BODY_TOP_PADDING_PX = 32;
export const BODY_BOTTOM_PADDING_PX = 8;

/** L'espace au-dessus d'une image libre (celui d'un encadré, `IMAGE_SPACING_STYLE`). */
export const IMAGE_GAP_PX = 20;

/** La cellule du corps, de la marge du haut donnée. */
export function bodyCellStyle(topPx: number): string {
  return `padding:${String(topPx)}px ${String(MAIL_BODY_GUTTER_PX)}px ${String(BODY_BOTTOM_PADDING_PX)}px;`;
}
