import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PromotionsTargetingZoneReader,
  type ZoneTargetingPromotion,
} from "../../delivery-zones/domain/ports/promotions-targeting-zone.reader.js";

/**
 * L'adaptateur de `PromotionsTargetingZoneReader` (zones de livraison) : les
 * promotions dont l'acheminement nomme la zone, archivées comprises (`documentation/promotions/promotions.md`, § 2.14).
 */
@Injectable()
export class PrismaPromotionsTargetingZoneReader extends PromotionsTargetingZoneReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async targeting(zoneId: string): Promise<readonly ZoneTargetingPromotion[]> {
    const rows = await this.prisma.promotion.findMany({
      where: { deliveryZones: { some: { zoneId } } },
      select: { id: true, internalName: true, archivedAt: true },
      orderBy: [{ internalName: "asc" }, { id: "asc" }],
    });
    const named = rows.map((row) => ({
      id: row.id,
      name: row.internalName,
      archived: row.archivedAt !== null,
    }));
    return [...named.filter((p) => !p.archived), ...named.filter((p) => p.archived)];
  }
}
