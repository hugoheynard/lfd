import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import type { ImagePalette } from "../value-objects/image-palette.js";

/**
 * Ce qu'une pose de palette a constaté.
 *
 * - `painted` — la palette était absente, elle est posée ;
 * - `already_painted` — l'image en portait déjà une, rien n'est écrit ;
 * - `not_in_library` — aucune image ne porte cette URL.
 */
export type PaletteOutcome = "painted" | "already_painted" | "not_in_library";

/**
 * **L'écriture de la palette d'une image** (2026-10-11).
 *
 * Un port à part, et pas une méthode de plus sur `MediaLibraryWriter` : le
 * dépôt et le rattrapage ont besoin de ce geste-là seulement (ISP).
 */
export abstract class MediaPalettes {
  /**
   * Pose la palette **si et seulement si** l'image n'en a pas encore.
   *
   * 🔴 La condition est DANS l'écriture (`palette IS NULL`), pas lue avant :
   * deux onglets qui rattrapent la même image ne peuvent pas s'écraser.
   */
  abstract paintIfBlank(
    url: string,
    palette: ImagePalette,
    ticket: WriteTicket,
  ): Promise<PaletteOutcome>;
}
