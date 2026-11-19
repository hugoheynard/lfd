import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductImageRepointing } from "../domain/ports/product-image-repointing.js";

/**
 * L'adaptateur : la fusion par `(fiche, rôle)`, puis le repointage. Sous deux
 * rôles différents, les deux lignes restent : ce ne sont pas des doublons.
 */
@Injectable()
export class PrismaProductImageRepointing extends ProductImageRepointing {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async repoint(from: string, to: string): Promise<number> {
    const rows = await this.prisma.productMedia.findMany({
      where: { mediaUrl: from },
      select: { productId: true, role: true },
    });
    if (rows.length === 0) {
      return 0;
    }
    await this.prisma.productMedia.deleteMany({
      where: {
        mediaUrl: to,
        OR: rows.map(({ productId, role }) => ({ productId, role })),
      },
    });
    await this.prisma.productMedia.updateMany({
      where: { mediaUrl: from },
      data: { mediaUrl: to },
    });
    return new Set(rows.map((row) => row.productId)).size;
  }
}
