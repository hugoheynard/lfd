import { Injectable } from "@nestjs/common";

import { MediaLibraryCensus } from "../../platform/storage/media-library-census.js";
import { MediaPrismaService } from "../infra/database/media-prisma.service.js";

/**
 * Le recensement du fonds, pour la carte OPS : un `count()` sur la table de la
 * médiathèque, par sa propre surface Prisma. Rien d'autre n'en sort.
 */
@Injectable()
export class PrismaMediaLibraryCensus extends MediaLibraryCensus {
  constructor(private readonly prisma: MediaPrismaService) {
    super();
  }

  countImages(): Promise<number> {
    return this.prisma.mediaAsset.count();
  }
}
