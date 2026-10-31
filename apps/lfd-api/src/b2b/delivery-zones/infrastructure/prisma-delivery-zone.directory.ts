import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryZoneDirectory } from "../../promotions/domain/ports/delivery-zone.directory.js";

/**
 * L'adaptateur de `DeliveryZoneDirectory` (promotions) : le libellé de chaque
 * zone demandée qui existe encore (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 9).
 */
@Injectable()
export class PrismaDeliveryZoneDirectory extends DeliveryZoneDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async labelsOf(zoneIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (zoneIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryZone.findMany({
      where: { id: { in: [...zoneIds] } },
      select: { id: true, label: true },
    });
    return new Map(rows.map((row) => [row.id, row.label]));
  }
}
