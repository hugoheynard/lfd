import { Injectable } from "@nestjs/common";

import { Prisma } from "../../platform/database/client/client.js";
import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import { MediaPalettes, type PaletteOutcome } from "../domain/ports/media-palettes.js";
import type { ImagePalette } from "../domain/value-objects/image-palette.js";

@Injectable()
export class PrismaMediaPalettes extends MediaPalettes {
  constructor(private readonly prisma: MediaPrismaService) {
    super();
  }

  async paintIfBlank(url: string, palette: ImagePalette): Promise<PaletteOutcome> {
    // `DbNull` = la colonne SQL est NULL ; c'est la condition de l'écriture,
    // pas une lecture préalable.
    const { count } = await this.prisma.mediaAsset.updateMany({
      where: { url, palette: { equals: Prisma.DbNull } },
      data: { palette: palette.map((swatch) => ({ ...swatch })) },
    });
    if (count > 0) {
      return "painted";
    }
    // Rien d'écrit : soit l'image a déjà sa palette, soit elle n'existe pas.
    // Cette lecture ne conditionne aucune écriture, elle choisit le refus.
    const exists = await this.prisma.mediaAsset.count({ where: { url } });
    return exists > 0 ? "already_painted" : "not_in_library";
  }
}
