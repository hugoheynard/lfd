import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TransferServedSites } from "../domain/transfer-served-sites.js";

/**
 * Les points servis par transfert : `supply = transfer` sur `pickup_addresses`.
 * `transfer_mode` n'en décide pas — il vaut `integrated` par défaut sur TOUT
 * point, Labo compris, et ne dit que COMMENT un point servi par transfert est
 * approvisionné (vérifié dans `settings.prisma` le 2026-10-21). *
 * Lit la table `site` en direct, et c'est admis (audit final, 2026-11-03) :
 * elle appartient au contexte `lafoliecoffee/sites`, dont `PrismaSiteRepository` est le
 * seul écrivain, et c'est le MÊME bloc `b2b` (`lint:prisma-model-ownership`
 * raisonne par bloc). Un port de `sites` pour quatre lectures d'une colonne
 * coûterait plus qu'il ne rend ; le jour où `site` quitte le bloc, ces quatre
 * lecteurs (`PrismaResupplySites`, `PrismaResupplySiteLabels`,
 * `PrismaTransferServedSites`, `PrismaDayStockReader.sites`) passent par lui.
 */
@Injectable()
export class PrismaTransferServedSites extends TransferServedSites {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async servedByTransfer(siteIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (siteIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.site.findMany({
      where: { id: { in: [...siteIds] }, supply: "transfer" },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}
