import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type AnsweredReturn,
  ProductionReturnRequests,
  type ReturnRequest,
} from "../domain/ports/production-return.requests.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** L'adaptateur Prisma des demandes de retour au colisage. */
@Injectable()
export class PrismaProductionReturnRequests extends ProductionReturnRequests {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async request(day: ServiceDay, request: ReturnRequest): Promise<void> {
    await this.prisma.productionReturnRequest.create({
      data: {
        requestId: request.requestId,
        serviceDay: day.value,
        batchId: request.batchId,
        sku: request.sku,
        quantity: request.quantity,
        requestedAt: request.requested.at,
        requestedBy: request.requested.by,
      },
    });
  }

  /**
   * Conditionnée en base : deux livraisons de la même réponse n'en posent
   * qu'une, et la seconde rend `null`.
   */
  async answer(
    requestId: string,
    returned: number,
    answeredAt: Date,
  ): Promise<AnsweredReturn | null> {
    const { count } = await this.prisma.productionReturnRequest.updateMany({
      where: { requestId, answeredAt: null },
      data: { returned, answeredAt },
    });
    if (count === 0) {
      return null;
    }
    const row = await this.prisma.productionReturnRequest.findUniqueOrThrow({
      where: { requestId },
      select: {
        serviceDay: true,
        batchId: true,
        sku: true,
        quantity: true,
        requestedAt: true,
        requestedBy: true,
      },
    });
    return {
      serviceDay: row.serviceDay,
      batchId: row.batchId,
      sku: row.sku,
      quantity: row.quantity,
      returned,
      requested: { at: row.requestedAt, by: row.requestedBy },
    };
  }
}
