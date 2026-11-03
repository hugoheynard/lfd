import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { type DayStockSite, DayStockReader } from "../domain/day-stock.reader.js";
import type { ResupplyReceiptSnapshot } from "../domain/resupply-receipt.js";
import type { PlacedSiteResupplySnapshot } from "../domain/site-resupply.js";
import { dayColumn } from "./day-column.js";
import { RECEIPT_LINES, receiptSnapshotOf } from "./resupply-receipt.row.js";
import { placedSnapshotOf, SITE_RESUPPLY_LINES } from "./site-resupply.row.js";

/**
 * Lecture Prisma de l'onglet Stock : une journée, tous points.
 *
 * **Sans `take`, délibérément** (2026-11-02). Les deux lectures sont bornées
 * par la donnée elle-même : UNE journée × les points actifs × les gestes
 * d'une journée de comptoir — quelques réassorts envoyés et autant de reçus
 * par point et par jour, jamais l'historique (le filtre porte sur la
 * journée, servi par un index : `site_resupply (service_day, site_id)` et
 * `resupply_receipt (service_day)`, migration `20261102260000`). Une borne
 * tronquerait EN SILENCE : le stock affiché compterait moins que ce qui est
 * arrivé, ce qui est pire qu'une lecture plus longue. Si un point devait un
 * jour envoyer des centaines de réassorts par jour, c'est l'onglet qu'il
 * faudrait paginer, pas cette lecture qu'il faudrait couper. *
 * Lit la table `site` en direct, et c'est admis (audit final, 2026-11-03) :
 * elle appartient au contexte `b2b/sites`, dont `PrismaSiteRepository` est le
 * seul écrivain, et c'est le MÊME bloc `b2b` (`lint:prisma-model-ownership`
 * raisonne par bloc). Un port de `sites` pour quatre lectures d'une colonne
 * coûterait plus qu'il ne rend ; le jour où `site` quitte le bloc, ces quatre
 * lecteurs (`PrismaResupplySites`, `PrismaResupplySiteLabels`,
 * `PrismaTransferServedSites`, `PrismaDayStockReader.sites`) passent par lui.
 */
@Injectable()
export class PrismaDayStockReader extends DayStockReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async sites(): Promise<readonly DayStockSite[]> {
    return this.prisma.site.findMany({
      where: { archivedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, label: true },
    });
  }

  async resuppliesOn(serviceDay: string): Promise<readonly PlacedSiteResupplySnapshot[]> {
    const rows = await this.prisma.siteResupply.findMany({
      where: { serviceDay: dayColumn(serviceDay), placedAt: { not: null } },
      include: { lines: SITE_RESUPPLY_LINES },
      orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(placedSnapshotOf);
  }

  async receiptsOn(serviceDay: string): Promise<readonly ResupplyReceiptSnapshot[]> {
    const rows = await this.prisma.resupplyReceipt.findMany({
      where: { serviceDay: dayColumn(serviceDay) },
      include: { lines: RECEIPT_LINES },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(receiptSnapshotOf);
  }
}
