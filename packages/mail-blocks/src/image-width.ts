/**
 * **La largeur d'une image d'e-mail** (plan `plan-editeur-par-blocs.md`,
 * § 19 ; Hugo, 2026-11-08) : une propriété du bloc image, pas un élément de
 * plus.
 *
 * - `content` — dans le corps, entre ses marges, comme tout bloc ;
 * - `full` — d'un bord de la carte à l'autre, comme le bandeau d'en-tête.
 *
 * Absente, l'image est `content` : tous les documents rangés avant ce champ
 * restent valides sans migration.
 */
export const IMAGE_WIDTHS = ["content", "full"] as const;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

export function isImageWidth(candidate: unknown): candidate is ImageWidth {
  return IMAGE_WIDTHS.some((width) => width === candidate);
}

/**
 * La géométrie de la carte d'un e-mail, en pixels : la SEULE source des
 * largeurs, lue par le rendu (`@lfd/mailer`, `html.ts`) et par la copie des
 * images (côté API). Changer l'une sans l'autre ferait des copies trop
 * petites, ou trop lourdes.
 */
export const MAIL_CARD_MAX_WIDTH_PX = 560;

/** La bordure de la carte, de chaque côté. */
export const MAIL_CARD_BORDER_PX = 1;

/** La marge du corps de la carte, à gauche et à droite. */
export const MAIL_BODY_GUTTER_PX = 32;

/** La largeur intérieure de la carte : celle d'une image pleine largeur. */
export const MAIL_CARD_INNER_WIDTH_PX = MAIL_CARD_MAX_WIDTH_PX - 2 * MAIL_CARD_BORDER_PX;

/** La largeur du corps, entre ses marges : celle d'une image `content`. */
export const MAIL_BODY_WIDTH_PX = MAIL_CARD_INNER_WIDTH_PX - 2 * MAIL_BODY_GUTTER_PX;

/** La densité des écrans visés par une copie (écrans « Retina »). */
export const MAIL_IMAGE_DENSITY = 2;

/** La largeur d'une image d'après son bloc ; absente, `content`. */
export function imageWidthOf(block: { readonly width?: ImageWidth }): ImageWidth {
  return block.width ?? "content";
}

/** La largeur affichée d'une image, en pixels CSS. */
export function imageDisplayWidthPx(width: ImageWidth): number {
  return width === "full" ? MAIL_CARD_INNER_WIDTH_PX : MAIL_BODY_WIDTH_PX;
}

/**
 * La largeur maximale de la copie d'une image : sa largeur affichée × la
 * densité. Une image plus étroite n'est jamais agrandie.
 */
export function imageCopyWidthPx(block: { readonly width?: ImageWidth }): number {
  return imageDisplayWidthPx(imageWidthOf(block)) * MAIL_IMAGE_DENSITY;
}
