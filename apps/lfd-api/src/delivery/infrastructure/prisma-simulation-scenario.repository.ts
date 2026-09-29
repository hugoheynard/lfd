import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { SimulationScenario } from "../domain/entities/simulation-scenario.js";
import { SimulationScenarioNameTakenError } from "../domain/errors/delivery-simulation-errors.js";
import { SimulationScenarioRepository } from "../domain/ports/simulation-scenario.repository.js";
import { scenarioContentOf } from "./simulation-scenario-content.js";

/** Code Prisma d'une violation d'unicité — ici, l'index partiel sur le nom. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Adaptateur Prisma des scénarios : `toDomain` par `SimulationScenario.restore`
 * (le contenu se revalide), `toPersistence` par `toState`.
 */
@Injectable()
export class PrismaSimulationScenarioRepository extends SimulationScenarioRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<SimulationScenario | null> {
    const row = await this.prisma.deliverySimulationScenario.findUnique({ where: { id } });
    return row === null
      ? null
      : SimulationScenario.restore({
          id: row.id,
          name: row.name,
          content: scenarioContentOf(row.scenario),
          createdAt: row.createdAt,
          createdByStaffId: row.createdByStaffId,
          updatedAt: row.updatedAt,
          updatedBy: {
            staffUserId: row.updatedByStaffId,
            name: row.updatedByName,
            role: row.updatedByRole,
          },
          archivedAt: row.archivedAt,
        });
  }

  async save(scenario: SimulationScenario): Promise<void> {
    const state = scenario.toState();
    const columns = {
      name: state.name,
      updatedAt: state.updatedAt,
      updatedByStaffId: state.updatedBy.staffUserId,
      updatedByName: state.updatedBy.name,
      updatedByRole: state.updatedBy.role,
      archivedAt: state.archivedAt,
    };
    // Un contenu illisible ne se réécrit pas : on garde ce qu'il portait.
    const content = state.content.readable ? { scenario: state.content.payload } : {};
    try {
      await this.prisma.deliverySimulationScenario.upsert({
        where: { id: state.id },
        create: {
          id: state.id,
          ...columns,
          scenario: state.content.readable ? state.content.payload : {},
          createdAt: state.createdAt,
          createdByStaffId: state.createdByStaffId,
        },
        update: { ...columns, ...content },
      });
    } catch (error: unknown) {
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw new SimulationScenarioNameTakenError(state.name);
      }
      throw error;
    }
  }

  async nameTaken(name: string, exceptId: string | null): Promise<boolean> {
    const holder = await this.prisma.deliverySimulationScenario.findFirst({
      where: {
        name,
        archivedAt: null,
        ...(exceptId === null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return holder !== null;
  }
}
