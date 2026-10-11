import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { MediaJournal } from "../journal/media-journal.js";
import { MediaPalettes } from "../domain/ports/media-palettes.js";
import { MediaNotInLibraryError } from "../domain/value-objects/image.js";
import { imagePalette, type PaletteSwatch } from "../domain/value-objects/image-palette.js";

/**
 * **Rattraper la palette d'une image** (plan L9, 2026-10-11) — l'écran la
 * calcule pour les images visibles qui n'en ont pas, et la pose ici.
 */
export class PaintMediaPaletteCommand {
  constructor(
    readonly url: string,
    readonly palette: readonly PaletteSwatch[],
  ) {}
}

/**
 * Pose la palette d'une image qui n'en a pas — et rien d'autre.
 *
 * Idempotent : une image qui a déjà la sienne la garde, et le geste réussit
 * quand même. Deux onglets ouverts sur la médiathèque rattrapent les mêmes
 * images ; le second ne doit ni écraser ni échouer.
 *
 * @throws {InvalidImagePaletteError} la palette ne peut pas en être une (400).
 * @throws {MediaNotInLibraryError} aucune image ne porte cette URL (404).
 */
@CommandHandler(PaintMediaPaletteCommand)
export class PaintMediaPaletteHandler implements ICommandHandler<PaintMediaPaletteCommand, void> {
  constructor(
    private readonly palettes: MediaPalettes,
    private readonly journal: MediaJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PaintMediaPaletteCommand): Promise<void> {
    const url = command.url.trim();
    const palette = imagePalette(command.palette);
    const outcome = await this.uow.run(() =>
      this.palettes.paintIfBlank(
        url,
        palette,
        // Le plan l'écrit (L9, « Stockage ») : la palette se DÉDUIT du contenu,
        // qui est l'identité de l'image. Elle ne change rien à l'image, donc
        // aucun fait à nommer.
        this.journal.untraced("la palette se déduit des octets : aucune décision n'est prise"),
      ),
    );
    if (outcome === "not_in_library") {
      throw new MediaNotInLibraryError(url);
    }
  }
}
