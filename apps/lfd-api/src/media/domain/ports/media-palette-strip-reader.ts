import type { StripImage } from "../services/palette-strip.js";
import type { LibraryFilter } from "./media-library-reader.js";

/**
 * **La lecture de la frise des couleurs** (L9, 2026-10-11).
 *
 * Un port à part du feed (ISP) : la frise ne lit ni page, ni curseur, ni
 * étiquette — seulement l'URL, la date retenue et la palette de TOUT le
 * fonds filtré.
 */
export abstract class MediaPaletteStripReader {
  /**
   * Les images du filtre, dans l'ordre CHRONOLOGIQUE : prise de vue (jour de
   * la série), dépôt à défaut, du plus ancien au plus récent ; l'URL départage.
   */
  abstract chronicle(filter: LibraryFilter): Promise<readonly StripImage[]>;
}
