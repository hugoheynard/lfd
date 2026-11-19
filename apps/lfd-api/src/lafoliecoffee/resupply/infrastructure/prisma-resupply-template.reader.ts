import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ResupplyTemplateSnapshot } from "../domain/resupply-template.js";
import { ResupplyTemplateReader } from "../domain/resupply-template.reader.js";
import { templateSnapshotOf } from "./resupply-template.row.js";

/**
 * Combien de modèles actifs un point liste au plus. Une bibliothèque en
 * garde quelques-uns ; la borne n'est là que pour qu'une page ait un fond.
 */
export const ACTIVE_TEMPLATES_LISTED = 100;

/** Lecture Prisma de la bibliothèque d'un point (index `site_id`), par nom, bornée. */
@Injectable()
export class PrismaResupplyTemplateReader extends ResupplyTemplateReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listActive(siteId: string): Promise<readonly ResupplyTemplateSnapshot[]> {
    const rows = await this.prisma.resupplyTemplate.findMany({
      where: { siteId, archivedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: ACTIVE_TEMPLATES_LISTED,
    });
    return rows.map(templateSnapshotOf);
  }
}
