import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PickupPointDirectory } from "../../promotions/domain/ports/pickup-point.directory.js";

/**
 * L'adaptateur de `PickupPointDirectory` (promotions) : le libellé de chaque
 * site demandé, ARCHIVÉS compris — un site s'archive, il ne se supprime pas,
 * et une promotion qui le nomme doit rester révisable (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 8.2).
 */
@Injectable()
export class PrismaPickupPointDirectory extends PickupPointDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async labelsOf(pickupIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (pickupIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.site.findMany({
      where: { id: { in: [...pickupIds] } },
      select: { id: true, label: true },
    });
    return new Map(rows.map((row) => [row.id, row.label]));
  }
}
