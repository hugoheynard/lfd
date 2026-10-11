import { imagePaletteSchema } from "@lfd/pim-contracts";

import type { ImagePalette } from "../domain/value-objects/image-palette.js";

/**
 * Relit la colonne `palette` : la palette, ou `null` si absente.
 *
 * Une valeur illisible rend aussi `null` plutôt que de mettre le feed en 500 :
 * la frise perd une colonne, le fonds reste parcourable. Elle ne peut venir
 * que d'une écriture hors du domaine, qui revalide tout ce qu'il range.
 */
export function readPaletteColumn(value: unknown): ImagePalette | null {
  if (value === null) {
    return null;
  }
  const parsed = imagePaletteSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
