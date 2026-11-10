import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplySites } from "../domain/resupply-sites.js";

/**
 * Les points de retrait (`pickup_addresses`) : existe et n'est pas archivé.
 * Lit la table `site` en direct, et c'est admis (audit final, 2026-11-03) :
 * elle appartient au contexte `lafoliecoffee/sites`, dont `PrismaSiteRepository` est le
 * seul écrivain, et c'est le MÊME bloc `b2b` (`lint:prisma-model-ownership`
 * raisonne par bloc). Un port de `sites` pour quatre lectures d'une colonne
 * coûterait plus qu'il ne rend ; le jour où `site` quitte le bloc, ces quatre
 * lecteurs (`PrismaResupplySites`, `PrismaResupplySiteLabels`,
 * `PrismaTransferServedSites`, `PrismaDayStockReader.sites`) passent par lui.
 */
@Injectable()
export class PrismaResupplySites extends ResupplySites {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(siteId: string): Promise<boolean> {
    const count = await this.prisma.site.count({ where: { id: siteId, archivedAt: null } });
    return count > 0;
  }
}
