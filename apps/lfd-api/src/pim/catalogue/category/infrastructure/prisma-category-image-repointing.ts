import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CategoryImageRepointing } from "../domain/ports/category-image-repointing.js";

/**
 * L'adaptateur : la fusion par `(famille, rôle)`, puis le repointage. Sous deux
 * rôles différents, les deux lignes restent : ce ne sont pas des doublons.
 */
@Injectable()
export class PrismaCategoryImageRepointing extends CategoryImageRepointing {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async repoint(from: string, to: string): Promise<number> {
    const rows = await this.prisma.categoryMedia.findMany({
      where: { mediaUrl: from },
      select: { categoryId: true, role: true },
    });
    if (rows.length === 0) {
      return 0;
    }
    await this.prisma.categoryMedia.deleteMany({
      where: {
        mediaUrl: to,
        OR: rows.map(({ categoryId, role }) => ({ categoryId, role })),
      },
    });
    await this.prisma.categoryMedia.updateMany({
      where: { mediaUrl: from },
      data: { mediaUrl: to },
    });
    return new Set(rows.map((row) => row.categoryId)).size;
  }
}
