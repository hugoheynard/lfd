import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PurchaseScenario } from "../domain/entities/purchase-scenario.js";
import { PurchaseScenarioNameTakenError } from "../domain/errors/delivery-purchase-scenario-errors.js";
import { PurchaseScenarioRepository } from "../domain/ports/purchase-scenario.repository.js";
import { purchaseScenarioContentOf } from "./purchase-scenario-content.js";

/** Code Prisma d'une violation d'unicité — ici, l'index partiel sur le nom. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Adaptateur Prisma des scénarios d'achat : `toDomain` par
 * `PurchaseScenario.restore` (le contenu se revalide), `toPersistence` par
 * `toState`. Sa propre table, dans le schéma `delivery`.
 */
@Injectable()
export class PrismaPurchaseScenarioRepository extends PurchaseScenarioRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<PurchaseScenario | null> {
    const row = await this.prisma.deliveryPurchaseScenario.findUnique({ where: { id } });
    return row === null
      ? null
      : PurchaseScenario.restore({
          id: row.id,
          name: row.name,
          stored: purchaseScenarioContentOf(row.content),
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

  async save(scenario: PurchaseScenario): Promise<void> {
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
    const content = state.stored.readable ? { content: state.stored.content } : {};
    try {
      await this.prisma.deliveryPurchaseScenario.upsert({
        where: { id: state.id },
        create: {
          id: state.id,
          ...columns,
          content: state.stored.readable ? state.stored.content : {},
          createdAt: state.createdAt,
          createdByStaffId: state.createdByStaffId,
        },
        update: { ...columns, ...content },
      });
    } catch (error: unknown) {
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw new PurchaseScenarioNameTakenError(state.name);
      }
      throw error;
    }
  }

  async activeNameTaken(name: string, exceptId: string): Promise<boolean> {
    const holder = await this.prisma.deliveryPurchaseScenario.findFirst({
      where: { name, archivedAt: null, id: { not: exceptId } },
      select: { id: true },
    });
    return holder !== null;
  }
}
