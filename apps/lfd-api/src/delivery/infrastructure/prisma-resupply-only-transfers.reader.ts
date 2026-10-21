import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  ResupplyOnlyTransfers,
  type ResupplyOnlyTransferRow,
} from "../domain/ports/resupply-only-transfers.reader.js";
import { stateOfTransfer } from "./prisma-carried-order-transfers.reader.js";

/** Un élément porté (un élément sorti à la réouverture n'engage plus le transfert). */
const CARRIED = { detachedAt: null } as const;

/** Adaptateur Prisma de `ResupplyOnlyTransfers` : une lecture pour la journée. */
@Injectable()
export class PrismaResupplyOnlyTransfers extends ResupplyOnlyTransfers {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resupplyOnlyOn(serviceDay: string): Promise<readonly ResupplyOnlyTransferRow[]> {
    const rows = await this.prisma.deliveryInternalTransfer.findMany({
      where: {
        serviceDay,
        items: { some: { ...CARRIED, kind: "resupply" }, none: { ...CARRIED, kind: "order" } },
      },
      orderBy: [{ siteLabel: "asc" }, { id: "asc" }],
      select: {
        id: true,
        siteId: true,
        siteLabel: true,
        createdAt: true,
        departedAt: true,
        receivedAt: true,
        _count: { select: { items: { where: { ...CARRIED, kind: "resupply" } } } },
      },
    });
    return rows.map((row) => ({
      ...stateOfTransfer(row),
      siteId: row.siteId,
      resupplyCount: row._count.items,
    }));
  }
}
