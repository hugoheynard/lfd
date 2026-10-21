import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TransferServedSites } from "../domain/transfer-served-sites.js";

/**
 * Les points servis par transfert : `supply = transfer` sur `pickup_addresses`.
 * `transfer_mode` n'en décide pas — il vaut `integrated` par défaut sur TOUT
 * point, Labo compris, et ne dit que COMMENT un point servi par transfert est
 * approvisionné (vérifié dans `settings.prisma` le 2026-10-21).
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
