import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";

/**
 * Le nom des points de retrait (`pickup_addresses`), archivés compris : un
 * réassort passé reste lisible.
 * Lit la table `site` en direct, et c'est admis (audit final, 2026-11-03) :
 * elle appartient au contexte `lafoliecoffee/sites`, dont `PrismaSiteRepository` est le
 * seul écrivain, et c'est le MÊME bloc `b2b` (`lint:prisma-model-ownership`
 * raisonne par bloc). Un port de `sites` pour quatre lectures d'une colonne
 * coûterait plus qu'il ne rend ; le jour où `site` quitte le bloc, ces quatre
 * lecteurs (`PrismaResupplySites`, `PrismaResupplySiteLabels`,
 * `PrismaTransferServedSites`, `PrismaDayStockReader.sites`) passent par lui.
 */
@Injectable()
export class PrismaResupplySiteLabels extends ResupplySiteLabels {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async labelsOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.site.findMany({
      where: { id: { in: [...siteIds] } },
      select: { id: true, label: true },
    });
    return new Map(rows.map((row) => [row.id, row.label]));
  }
}
