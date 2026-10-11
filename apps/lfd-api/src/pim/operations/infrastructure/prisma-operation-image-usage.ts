import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import {
  OperationImageUsage,
  type OperationShowingImage,
} from "../domain/ports/operation-image-usage.js";

/** Les opérations dont `image_url` est l'URL demandée — archivées comprises. */
@Injectable()
export class PrismaOperationImageUsage extends OperationImageUsage {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async operationsShowing(url: string): Promise<readonly OperationShowingImage[]> {
    const rows = await this.prisma.operation.findMany({
      where: { imageUrl: url },
      select: { key: true, imageAlt: true },
      orderBy: { key: "asc" },
    });
    return rows.map((row) => ({ key: row.key, image: { url, alt: row.imageAlt ?? "" } }));
  }
}
