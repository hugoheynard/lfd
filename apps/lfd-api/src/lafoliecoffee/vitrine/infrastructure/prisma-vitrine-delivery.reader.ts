import type { VitrineDeliveryView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VitrineDeliveryReader } from "../domain/ports/vitrine-delivery.reader.js";
import { deliveryToView } from "./vitrine-delivery.mapper.js";

/** Adaptateur Prisma du journal des envois. */
@Injectable()
export class PrismaVitrineDeliveryReader extends VitrineDeliveryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForSubscriber(
    subscriberId: string,
    limit: number,
  ): Promise<readonly VitrineDeliveryView[]> {
    const rows = await this.prisma.vitrineDelivery.findMany({
      where: { subscriberId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(deliveryToView);
  }
}
