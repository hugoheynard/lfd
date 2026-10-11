import {
  SHOP_COPY_PREVIEW_VIEWPORT_WIDTHS,
  type ShopCopyPreviewViewport,
} from '@lfd/contracts/shop-copy-preview';

/** La géométrie de l'iframe réduite : ce qu'elle rend, ce qu'elle occupe, et le facteur. */
export interface PreviewScale {
  /** La largeur RENDUE (px CSS) — celle que voient les media queries de la boutique. */
  readonly frameWidth: number;
  /** La hauteur rendue : la hauteur affichée, agrandie d'autant que la largeur est réduite. */
  readonly frameHeight: number;
  /** Le facteur `transform: scale(k)` ; jamais au-dessus de 1 — on réduit, on n'agrandit pas. */
  readonly k: number;
  /** La place occupée dans la colonne, une fois réduite. */
  readonly boxWidth: number;
  readonly boxHeight: number;
}

/**
 * **Dézoomer plutôt que tasser** (Hugo, 2026-10-11) : la boutique est rendue à
 * sa vraie largeur — 1280 px en « bureau », 390 en « mobile », les mêmes que
 * la fenêtre détachée — puis réduite pour tenir dans la colonne. Une largeur
 * de colonne inconnue (0, avant le premier relevé) ne réduit rien.
 */
export function previewScale(
  viewport: ShopCopyPreviewViewport,
  columnWidth: number,
  displayHeight: number,
): PreviewScale {
  const frameWidth = SHOP_COPY_PREVIEW_VIEWPORT_WIDTHS[viewport];
  const k = columnWidth > 0 ? Math.min(1, columnWidth / frameWidth) : 1;
  return {
    frameWidth,
    frameHeight: Math.round(displayHeight / k),
    k,
    boxWidth: Math.round(frameWidth * k),
    boxHeight: Math.round(displayHeight),
  };
}

/** « Aperçu réduit à 50 % » — `null` à taille réelle. */
export function scaleLabel(k: number): string | null {
  return k < 1 ? `Aperçu réduit à ${Math.round(k * 100)} %` : null;
}
