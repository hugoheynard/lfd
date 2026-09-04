import { Injectable } from "@nestjs/common";
import type { OrderCutoffWaiverPayload, OrderCutoffWaiverView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OpenWaiverAlreadyExistsError,
  OrderCutoffWaiverNotFoundError,
} from "../domain/order-cutoff-waiver-errors.js";
import { OrderCutoffWaiverRepository } from "../domain/order-cutoff-waiver.repository.js";

/** Code Postgres d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "P2002";

/** Une ligne telle que Prisma la rend. */
interface WaiverRow {
  readonly id: string;
  readonly companyId: string;
  readonly fulfillmentDate: Date;
  readonly reason: string;
  readonly grantedByStaffId: string;
  readonly grantedAt: Date;
  readonly usedByOrderId: string | null;
}

@Injectable()
export class PrismaOrderCutoffWaiverRepository extends OrderCutoffWaiverRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listFor(companyId: string): Promise<readonly OrderCutoffWaiverView[]> {
    const rows = await this.prisma.orderCutoffWaiver.findMany({
      where: { companyId },
      orderBy: { grantedAt: "desc" },
    });
    return rows.map(toView);
  }

  /**
   * L'unicité est laissée à la BASE, et pas testée avant d'écrire.
   *
   * Un `findFirst` suivi d'un `create` laisserait passer deux dérogations
   * accordées à la même seconde par deux commerciaux — la fenêtre est étroite,
   * mais c'est précisément le moment où deux personnes s'occupent du même client
   * en retard. L'index partiel ne connaît pas cette fenêtre.
   */
  async grant(payload: OrderCutoffWaiverPayload, grantedByStaffId: string): Promise<string> {
    try {
      const created = await this.prisma.orderCutoffWaiver.create({
        data: {
          companyId: payload.companyId,
          fulfillmentDate: new Date(`${payload.fulfillmentDate}T00:00:00.000Z`),
          reason: payload.reason,
          grantedByStaffId,
        },
        select: { id: true },
      });
      return created.id;
    } catch (error: unknown) {
      const code: unknown = error instanceof Error ? Reflect.get(error, "code") : null;
      if (code === UNIQUE_VIOLATION) {
        throw new OpenWaiverAlreadyExistsError(payload.companyId);
      }
      throw error instanceof Error ? error : new Error("Dérogation impossible à écrire.");
    }
  }

  /**
   * Le `where` porte `usedByOrderId: null` : une dérogation **consommée** n'est
   * pas trouvée, donc pas retirable. Elle atteste ce qui s'est passé, et une
   * commande passée ne se dépasse pas — le refus vient donc de la requête, pas
   * d'un test qu'un second chemin d'écriture pourrait oublier.
   */
  async revoke(id: string): Promise<void> {
    const deleted = await this.prisma.orderCutoffWaiver.deleteMany({
      where: { id, usedByOrderId: null },
    });
    if (deleted.count === 0) {
      throw new OrderCutoffWaiverNotFoundError(id);
    }
  }
}

function toView(row: WaiverRow): OrderCutoffWaiverView {
  return {
    id: row.id,
    companyId: row.companyId,
    // La colonne est une DATE : on rend le jour, jamais un instant. Le passer en
    // ISO complet ferait apparaître un `T00:00:00Z` qu'aucun écran ne veut, et
    // qu'un fuseau ferait glisser d'un jour.
    fulfillmentDate: row.fulfillmentDate.toISOString().slice(0, 10),
    reason: row.reason,
    grantedByStaffId: row.grantedByStaffId,
    grantedAt: row.grantedAt.toISOString(),
    usedByOrderId: row.usedByOrderId,
  };
}
