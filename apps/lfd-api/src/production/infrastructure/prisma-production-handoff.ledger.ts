import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionHandoffLedger } from "../domain/ports/production-handoff.ledger.js";
import type { ProductionHandoff } from "../domain/services/production-handoff.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * L'adaptateur Prisma du registre des remises. `ON CONFLICT DO NOTHING` sur
 * l'`id` : deux déclarations simultanées de la même fournée n'en écrivent
 * qu'une, et c'est la base qui arbitre.
 */
@Injectable()
export class PrismaProductionHandoffLedger extends ProductionHandoffLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(day: ServiceDay, handoff: ProductionHandoff): Promise<void> {
    await this.prisma.productionHandoff.createMany({
      data: [
        {
          id: handoff.id,
          serviceDay: day.value,
          sku: handoff.sku,
          quantity: handoff.quantity,
          source: handoff.source,
          at: handoff.at,
          by: handoff.by,
          requestId: handoff.requestId,
        },
      ],
      skipDuplicates: true,
    });
  }
}
