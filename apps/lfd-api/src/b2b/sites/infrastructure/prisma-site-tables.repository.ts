import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SiteTables } from "../domain/site-tables.js";
import { SiteTablesRepository } from "../domain/site-tables.repository.js";

/**
 * Adaptateur Prisma de la grille de tables (`public.site_table`). Il ne tient
 * aucune règle : elles sont dans l'agrégat. Il rejoint la transaction ambiante
 * de l'unité de travail.
 */
@Injectable()
export class PrismaSiteTablesRepository extends SiteTablesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(siteId: string): Promise<SiteTables> {
    const rows = await this.prisma.siteTable.findMany({
      where: { siteId },
      orderBy: { number: "asc" },
      select: { number: true, token: true, qrCreatedAt: true },
    });
    return SiteTables.rehydrate({ siteId, tables: rows });
  }

  /**
   * Réécrit la grille : les lignes d'une table qui n'est plus dans la grille
   * sont des lignes d'équipement, pas un agrégat — elles s'effacent, et leur
   * jeton avec. Effacer avant d'écrire libère les jetons (index unique).
   */
  async save(tables: SiteTables): Promise<void> {
    const { siteId, tables: rows } = tables.snapshot();
    await this.prisma.siteTable.deleteMany({ where: { siteId } });
    if (rows.length > 0) {
      await this.prisma.siteTable.createMany({
        data: rows.map((row) => ({ siteId, ...row })),
      });
    }
  }
}
