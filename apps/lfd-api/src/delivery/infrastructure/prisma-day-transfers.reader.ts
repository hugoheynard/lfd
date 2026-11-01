import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DayTransfersReader, type DayTransferRow } from "../domain/ports/day-transfers.reader.js";

/** L'adaptateur de {@link DayTransfersReader} : une lecture, un élément porté au moins. */
@Injectable()
export class PrismaDayTransfersReader extends DayTransfersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  transfersOn(serviceDay: string): Promise<readonly DayTransferRow[]> {
    return this.prisma.deliveryInternalTransfer.findMany({
      where: { serviceDay, items: { some: { detachedAt: null } } },
      orderBy: [{ siteId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, siteId: true, siteLabel: true, departedAt: true },
    });
  }
}
