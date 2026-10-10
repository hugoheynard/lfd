import { Injectable } from "@nestjs/common";
import { altColumn } from "./alt-columns.js";

import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import { MediaLibraryWriter, type MediaDetails } from "../domain/ports/media-library-writer.js";

@Injectable()
export class PrismaMediaLibraryWriter extends MediaLibraryWriter {
  constructor(private readonly prisma: MediaPrismaService) {
    super();
  }

  async describe(url: string, details: MediaDetails): Promise<boolean> {
    // Le laissez-passer n'est pas lu : sa seule existence prouve qu'un fait a
    // été posé (ou une dérogation nommée) avant qu'on arrive ici.
    // `updateMany` sur une URL unique (une image, une ligne, depuis le
    // 2026-09-23) : il touche au plus une ligne, et rend 0 sans lever quand
    // l'image a disparu entre-temps — ce que `update` ferait en 404 technique.
    const written = await this.prisma.mediaAsset.updateMany({
      where: { url },
      data: {
        name: details.name,
        tags: [...details.tags],
        alt: altColumn(details.alt),
        focalX: details.focal?.x ?? null,
        focalY: details.focal?.y ?? null,
      },
    });
    return written.count > 0;
  }

  async discard(url: string): Promise<number> {
    const { count } = await this.prisma.mediaAsset.deleteMany({ where: { url } });
    return count;
  }
}
