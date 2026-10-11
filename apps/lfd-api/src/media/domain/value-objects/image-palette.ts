import {
  PALETTE_HEX_PATTERN,
  PALETTE_LIMITS,
  type ImagePalette,
  type PaletteSwatch,
} from "@lfd/pim-contracts";

import { DomainError } from "../../../platform/shared/errors/app-error.js";

export type { ImagePalette, PaletteSwatch };

/**
 * **La palette d'une image**, revalidée (plan L9, R28, 2026-10-11).
 *
 * Elle est calculée par le navigateur : le serveur ne peut pas la refaire, il
 * peut seulement refuser ce qui ne peut pas en être une. Les bornes sont
 * celles du contrat, que l'écran lit pour ne pas envoyer de palette refusée.
 *
 * Le hex est rangé en minuscules : deux écritures d'une même couleur ne
 * doivent pas faire deux couleurs pour la frise.
 *
 * @throws {InvalidImagePaletteError} une des quatre règles est violée.
 */
export function imagePalette(raw: readonly PaletteSwatch[]): ImagePalette {
  if (raw.length === 0 || raw.length > PALETTE_LIMITS.maxSwatches) {
    throw new InvalidImagePaletteError(
      `${String(raw.length)} couleur(s) reçue(s), il en faut de 1 à ${String(PALETTE_LIMITS.maxSwatches)}`,
    );
  }
  const swatches = raw.map(paletteSwatch);
  const dominantShare = swatches
    .filter((swatch) => !swatch.outlier)
    .reduce((sum, swatch) => sum + swatch.share, 0);
  if (
    dominantShare < PALETTE_LIMITS.dominantShareMin ||
    dominantShare > PALETTE_LIMITS.dominantShareMax
  ) {
    throw new InvalidImagePaletteError(
      `les dominantes couvrent ${dominantShare.toFixed(2)} de l'image, il faut entre ${String(PALETTE_LIMITS.dominantShareMin)} et ${String(PALETTE_LIMITS.dominantShareMax)}`,
    );
  }
  return swatches;
}

function paletteSwatch(swatch: PaletteSwatch): PaletteSwatch {
  if (!PALETTE_HEX_PATTERN.test(swatch.hex)) {
    throw new InvalidImagePaletteError(`couleur « ${swatch.hex} » illisible, attendue en #rrggbb`);
  }
  if (!Number.isFinite(swatch.share) || swatch.share < 0 || swatch.share > 1) {
    throw new InvalidImagePaletteError(
      `part ${String(swatch.share)} hors de 0 à 1 pour la couleur ${swatch.hex}`,
    );
  }
  return { hex: swatch.hex.toLowerCase(), share: swatch.share, outlier: swatch.outlier };
}

/** Une palette que le serveur ne peut pas ranger (→ 400). */
export class InvalidImagePaletteError extends DomainError {
  constructor(detail: string) {
    super(
      "media.palette.invalid",
      `Palette de couleurs refusée : ${detail}. Elle est calculée par l'écran — rechargez la médiathèque pour qu'il la recalcule.`,
    );
  }
}
