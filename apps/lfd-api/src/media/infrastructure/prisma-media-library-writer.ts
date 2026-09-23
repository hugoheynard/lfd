import { Injectable } from "@nestjs/common";

import { localizedColumn } from "../../pim/catalogue/shared/infrastructure/json-readers.js";
import { PimPrismaService } from "../../pim/infra/database/pim-prisma.service.js";
import { MediaLibraryWriter, type MediaDetails } from "../domain/ports/media-library-writer.js";

@Injectable()
export class PrismaMediaLibraryWriter extends MediaLibraryWriter {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async describe(url: string, details: MediaDetails): Promise<boolean> {
    // Le laissez-passer n'est pas lu : sa seule existence prouve qu'un fait a
    // été posé (ou une dérogation nommée) avant qu'on arrive ici.
    // 🔴 `updateMany` et non `update` : plusieurs inscriptions portent la même
    // URL, et n'en corriger qu'une laisserait les autres dire le contraire. La
    // lecture groupe par URL et prend « la plus récente qui en porte » — elle
    // choisirait alors au hasard de la date.
    const written = await this.prisma.mediaAsset.updateMany({
      where: { url },
      data: {
        name: details.name,
        tags: [...details.tags],
        alt: localizedColumn(details.alt),
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
