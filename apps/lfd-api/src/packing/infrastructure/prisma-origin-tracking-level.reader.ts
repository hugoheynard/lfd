import { Injectable } from "@nestjs/common";

import { FIRST_SHIPMENT_RANK } from "../../production/channels/packing/index.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type PackingTrackingLevel,
  packingTrackingLevelOf,
} from "../domain/entities/packing-tracking-level.js";
import { OriginTrackingLevelReader } from "../domain/ports/origin-tracking-level.reader.js";

/** Adaptateur Prisma : la fiche de rang 1 la plus récente, au plus tard le jour du reliquat. */
@Injectable()
export class PrismaOriginTrackingLevelReader extends OriginTrackingLevelReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async originLevelOf(orderId: string, serviceDay: string): Promise<PackingTrackingLevel | null> {
    const origin = await this.prisma.packingOrder.findFirst({
      where: { orderId, rank: FIRST_SHIPMENT_RANK, serviceDay: { lte: serviceDay } },
      orderBy: { serviceDay: "desc" },
      select: { trackingLevel: true },
    });
    return origin?.trackingLevel == null ? null : packingTrackingLevelOf(origin.trackingLevel);
  }
}
