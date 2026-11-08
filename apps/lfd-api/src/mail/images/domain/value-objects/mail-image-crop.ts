import { IMAGE_FORMAT_RATIOS, type ImageFraming } from "@lfd/mail-blocks";

/** La qualité de réencodage des formats avec perte (JPEG, WebP), de 1 à 100. */
export const MAIL_IMAGE_LOSSY_QUALITY = 82;

/** Un rectangle en pixels entiers dans l'image. */
export interface CropRectangle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * **Le rectangle à garder** : le plus grand au rapport du format, centré sur
 * le point focal autant que l'image le permet — il glisse vers l'intérieur
 * plutôt que de sortir de l'image. Pur : les dimensions viennent de
 * l'adaptateur qui décode l'image.
 */
export function cropRectangle(
  imageWidth: number,
  imageHeight: number,
  framing: ImageFraming,
): CropRectangle {
  const ratio = IMAGE_FORMAT_RATIOS[framing.format];
  const width = clamp(Math.round(Math.min(imageWidth, imageHeight * ratio)), 1, imageWidth);
  const height = clamp(Math.round(Math.min(imageHeight, imageWidth / ratio)), 1, imageHeight);
  return {
    left: clamp(Math.round(framing.focal.x * imageWidth - width / 2), 0, imageWidth - width),
    top: clamp(Math.round(framing.focal.y * imageHeight - height / 2), 0, imageHeight - height),
    width,
    height,
  };
}
