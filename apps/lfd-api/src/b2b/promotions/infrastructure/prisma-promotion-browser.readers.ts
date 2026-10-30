import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PromotionBrowser } from "../domain/ports/promotion-browser.reader.js";
import { PromotionRivalsReader } from "../domain/ports/promotion-rivals.reader.js";
import type { PromotionApplicationPoint } from "../domain/promotion-fulfillment.js";
import type { Promotion } from "../domain/promotion.js";
import { toDomain } from "./promotion-rows.js";

/**
 * **Les lectures de l'écran et du refus de chevauchement** (plan des
 * promotions, L7) — hors du cache des matériaux de prix : ni l'une ni
 * l'autre n'est sur le chemin qui facture, et le refus doit voir l'état
 * commis, pas une copie.
 *
 * Chaque ligne repasse par `toDomain`, donc par l'agrégat.
 */
const WITH_SCOPE = {
  scopeRules: { orderBy: [{ target: "asc" as const }, { targetId: "asc" as const }] },
  audienceTargets: true,
};

@Injectable()
export class PrismaPromotionBrowser extends PromotionBrowser {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async all(): Promise<readonly Promotion[]> {
    const rows = await this.prisma.promotion.findMany({
      include: WITH_SCOPE,
      orderBy: [{ validFrom: "desc" }, { id: "asc" }],
    });
    return rows.map((row) => toDomain(row, row.scopeRules, row.audienceTargets));
  }

  async naming(companyId: string): Promise<readonly Promotion[]> {
    const rows = await this.prisma.promotion.findMany({
      where: { audienceTargets: { some: { companyId } } },
      include: WITH_SCOPE,
      orderBy: [{ validFrom: "desc" }, { id: "asc" }],
    });
    return rows.map((row) => toDomain(row, row.scopeRules, row.audienceTargets));
  }

  async find(id: string): Promise<Promotion | null> {
    const row = await this.prisma.promotion.findUnique({ where: { id }, include: WITH_SCOPE });
    return row === null ? null : toDomain(row, row.scopeRules, row.audienceTargets);
  }
}

@Injectable()
export class PrismaPromotionRivalsReader extends PromotionRivalsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unarchived(point: PromotionApplicationPoint): Promise<readonly Promotion[]> {
    const rows = await this.prisma.promotion.findMany({
      where: { applicationPoint: point, archivedAt: null },
      include: WITH_SCOPE,
      orderBy: { id: "asc" },
    });
    return rows.map((row) => toDomain(row, row.scopeRules, row.audienceTargets));
  }
}
