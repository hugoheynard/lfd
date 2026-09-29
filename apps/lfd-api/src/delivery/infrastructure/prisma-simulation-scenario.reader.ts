import type { DeliverySimulationScenarioSummaryView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  SimulationScenarioReader,
  type SimulationScenarioRecord,
} from "../domain/ports/simulation-scenario.reader.js";
import { rawCountOf, scenarioContentOf } from "./simulation-scenario-content.js";

/**
 * Adaptateur Prisma de la lecture des scénarios. L'auteur rendu est le NOM
 * figé au geste — jamais un identifiant chez un tiers ; vide, il est `null`.
 */
@Injectable()
export class PrismaSimulationScenarioReader extends SimulationScenarioReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly DeliverySimulationScenarioSummaryView[]> {
    const rows = await this.prisma.deliverySimulationScenario.findMany({
      where: { archivedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      stops: rawCountOf(row.scenario, "stops"),
      vehicles: rawCountOf(row.scenario, "vehicles"),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
    }));
  }

  async byId(id: string): Promise<SimulationScenarioRecord | null> {
    const row = await this.prisma.deliverySimulationScenario.findFirst({
      where: { id, archivedAt: null },
    });
    return row === null
      ? null
      : {
          id: row.id,
          name: row.name,
          content: scenarioContentOf(row.scenario),
          updatedAt: row.updatedAt,
        };
  }
}
