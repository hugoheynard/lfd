import { Injectable } from "@nestjs/common";
import type { MarketConfigView, MarketZoneCount } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { MarketConfigStore } from "../domain/ports/market-config.store.js";

/** Adaptateur Prisma de la config marché (zones + NAF + comptages stockés). */
@Injectable()
export class PrismaMarketConfigStore extends MarketConfigStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<MarketConfigView> {
    const [zones, nafs] = await Promise.all([
      this.prisma.marketZone.findMany({ orderBy: { codePostal: "asc" } }),
      this.prisma.marketNafCode.findMany({ orderBy: { code: "asc" } }),
    ]);
    const lastRefreshedAt = zones.reduce<Date | null>(
      (max, z) => (z.fetchedAt !== null && (max === null || z.fetchedAt > max) ? z.fetchedAt : max),
      null,
    );
    return {
      zones: zones.map((z) => ({
        codePostal: z.codePostal,
        addressable: z.addressable,
        perNaf: toPerNaf(z.perNaf),
        fetchedAt: z.fetchedAt?.toISOString() ?? null,
      })),
      nafCodes: nafs.map((n) => ({ code: n.code, label: n.label })),
      lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
    };
  }

  async addZone(codePostal: string): Promise<void> {
    await this.prisma.marketZone.upsert({
      where: { codePostal },
      create: { codePostal },
      update: {},
    });
  }

  async removeZone(codePostal: string): Promise<void> {
    await this.prisma.marketZone.deleteMany({ where: { codePostal } });
  }

  async addNaf(code: string, label: string): Promise<void> {
    await this.prisma.marketNafCode.upsert({
      where: { code },
      create: { code, label },
      update: { label },
    });
  }

  async removeNaf(code: string): Promise<void> {
    await this.prisma.marketNafCode.deleteMany({ where: { code } });
  }

  async saveZoneCounts(
    codePostal: string,
    perNaf: readonly MarketZoneCount[],
    addressable: number,
    fetchedAt: Date,
  ): Promise<void> {
    await this.prisma.marketZone.update({
      where: { codePostal },
      data: {
        addressable,
        fetchedAt,
        perNaf: perNaf.map((p) => ({ code: p.code, count: p.count })),
      },
    });
  }
}

/** Parse la colonne `per_naf` (JSON) en comptages typés, robuste aux valeurs douteuses. */
function toPerNaf(value: unknown): MarketZoneCount[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: MarketZoneCount[] = [];
  for (const item of value) {
    if (typeof item === "object" && item !== null) {
      const rec = item as Record<string, unknown>;
      const code = rec["code"];
      const count = rec["count"];
      if (typeof code === "string" && typeof count === "number") {
        out.push({ code, count });
      }
    }
  }
  return out;
}
