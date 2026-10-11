import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../platform/journal/scoped-journal.js";
import { MediaJournal } from "../journal/media-journal.js";
import { MediaPalettes } from "../domain/ports/media-palettes.js";
import type { ImagePalette } from "../domain/value-objects/image-palette.js";

/**
 * Pourquoi poser une palette ne se journalise pas : elle se DÉDUIT du
 * contenu, qui est l'identité de l'image. Elle ne change rien à l'image, donc
 * aucun fait à nommer. Une seule phrase pour le dépôt et le rattrapage.
 */
export const PALETTE_IS_DEDUCED = "la palette se déduit des octets : aucune décision n'est prise";

/**
 * **La palette qu'un dépôt apporte** — posée si l'écran en a envoyé une, et
 * seulement sur une image qui n'en a pas encore. Sortie du dépôt le
 * 2026-10-11 : ranger une image et peindre sa palette ne changent pas pour
 * les mêmes raisons.
 */
@Injectable()
export class DepositPalette {
  constructor(
    private readonly palettes: MediaPalettes,
    private readonly journal: MediaJournal,
  ) {}

  /** Sous le ticket du dépôt qui inscrit l'image. Ne remplace jamais. */
  async paint(url: string, palette: ImagePalette | null, ticket: WriteTicket): Promise<void> {
    if (palette !== null) {
      await this.palettes.paintIfBlank(url, palette, ticket);
    }
  }

  /** Sur une image déjà au fonds : rien n'est décidé, la palette se déduit. */
  async paintDeduced(url: string, palette: ImagePalette | null): Promise<void> {
    await this.paint(url, palette, this.journal.untraced(PALETTE_IS_DEDUCED));
  }
}
