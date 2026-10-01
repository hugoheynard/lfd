import type { PurchaseScenarioSummaryView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type PurchaseScenarioRecord,
  PurchaseScenariosReader,
} from "../domain/ports/purchase-scenarios.reader.js";
import { purchaseScenarioContentOf, rawSelectionCountOf } from "./purchase-scenario-content.js";

/**
 * Lecture Prisma des scénarios d'achat. L'auteur rendu est le NOM figé au
 * geste — jamais un identifiant chez un tiers ; vide, il est `null`.
 */
@Injectable()
export class PrismaPurchaseScenariosReader extends PurchaseScenariosReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(includeArchived: boolean): Promise<readonly PurchaseScenarioSummaryView[]> {
    const rows = await this.prisma.deliveryPurchaseScenario.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      vehicles: rawSelectionCountOf(row.content, "vehicles"),
      formats: rawSelectionCountOf(row.content, "formats"),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    }));
  }

  async byId(id: string): Promise<PurchaseScenarioRecord | null> {
    const row = await this.prisma.deliveryPurchaseScenario.findUnique({ where: { id } });
    return row === null
      ? null
      : {
          id: row.id,
          name: row.name,
          stored: purchaseScenarioContentOf(row.content),
          updatedAt: row.updatedAt,
          archivedAt: row.archivedAt,
        };
  }
}
