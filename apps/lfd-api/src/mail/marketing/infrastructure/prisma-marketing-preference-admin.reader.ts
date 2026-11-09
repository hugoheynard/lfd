import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MarketingPreferenceSnapshot } from "../domain/entities/marketing-preference-state.js";
import {
  type MarketingPreferenceAdminFilter,
  MarketingPreferenceAdminReader,
} from "../domain/ports/marketing-preference-admin.reader.js";
import { toDomain } from "./marketing-preference-row.js";

/**
 * Le registre, lu pour le back-office. Chaque ligne repasse par l'agrégat
 * (`toDomain`) : une valeur que ce binaire ne connaît pas échoue ici plutôt
 * que d'être servie telle quelle.
 */
@Injectable()
export class PrismaMarketingPreferenceAdminReader extends MarketingPreferenceAdminReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(
    filter: MarketingPreferenceAdminFilter,
    afterId: string | null,
    limit: number,
  ): Promise<readonly MarketingPreferenceSnapshot[]> {
    const rows = await this.prisma.mailMarketingPreference.findMany({
      where: {
        ...(filter.space === null ? {} : { space: filter.space }),
        ...(filter.status === null ? {} : { status: filter.status }),
        ...(afterId === null ? {} : { id: { lt: afterId } }),
      },
      orderBy: { id: "desc" },
      take: limit,
    });
    return rows.map((row) => toDomain(row).snapshot());
  }

  async byIds(ids: readonly string[]): Promise<readonly MarketingPreferenceSnapshot[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.mailMarketingPreference.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { id: "desc" },
    });
    return rows.map((row) => toDomain(row).snapshot());
  }

  async detail(id: string): Promise<MarketingPreferenceSnapshot | null> {
    const row = await this.prisma.mailMarketingPreference.findUnique({ where: { id } });
    return row === null ? null : toDomain(row).snapshot();
  }
}
