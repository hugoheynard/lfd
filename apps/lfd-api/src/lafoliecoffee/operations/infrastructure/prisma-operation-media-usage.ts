import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OperationMediaUsage,
  type OperationMediaUsageEntry,
} from "../channels/media/operation-media-usage.js";

/**
 * Adaptateur Prisma des images des opérations du commerce, sur
 * `catalog_operations` — la table que ce contexte écrit.
 *
 * Toutes comptent, **archivées comprises** (plan, « Après le lot 2 ») : comme
 * au référentiel, l'image d'une opération archivée reste protégée, pour que
 * l'historique ne pointe pas vers une image disparue.
 */
@Injectable()
export class PrismaOperationMediaUsage extends OperationMediaUsage {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (urls.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogOperation.groupBy({
      by: ["imageUrl"],
      where: { imageUrl: { in: [...urls] } },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.imageUrl !== null) {
        counts.set(row.imageUrl, row._count._all);
      }
    }
    return counts;
  }

  async usagesOf(url: string): Promise<readonly OperationMediaUsageEntry[]> {
    const rows = await this.prisma.catalogOperation.findMany({
      where: { imageUrl: url },
      select: { key: true, name: true },
      orderBy: { key: "asc" },
    });
    return rows.map((row) => ({ operationKey: row.key, label: frenchName(row.name) ?? row.key }));
  }
}

/** Le nom français, s'il est lisible. */
function frenchName(name: unknown): string | null {
  if (typeof name !== "object" || name === null || !("fr" in name)) {
    return null;
  }
  const fr = name.fr;
  return typeof fr === "string" && fr.trim() !== "" ? fr.trim() : null;
}
