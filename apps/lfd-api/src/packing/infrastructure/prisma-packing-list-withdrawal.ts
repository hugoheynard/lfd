import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingListWithdrawal } from "../domain/ports/packing-list-withdrawal.js";

/**
 * L'adaptateur Prisma du retrait d'une liste défaite. Il tourne dans l'unité
 * de travail que la garde du relais ouvre pour la livraison du fait.
 *
 * 🔴 **Un effacement, et il est délibéré.** Ces lignes sont l'inscription
 * que le TIRAGE du fournil a posée — rien d'autre ; la réouverture efface ce
 * tirage chez le fournil, qui réécrit de même ses propres commandes à chaque
 * enregistrement de la journée. Les garder ferait coliser au prochain arrêt
 * une commande dans l'état d'AVANT la réouverture : l'inscription ne se
 * réécrit jamais (`skipDuplicates`). Aucune ligne effacée ne porte de geste :
 * le filtre ne retient que les commandes intouchées, et la clé étrangère
 * `Restrict` des contenants refuse le reste.
 */
@Injectable()
export class PrismaPackingListWithdrawal extends PackingListWithdrawal {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async withdrawUntouched(serviceDay: string, orderIds: readonly string[]): Promise<number> {
    const untouched = await this.prisma.packingOrder.findMany({
      where: {
        serviceDay,
        orderId: { in: [...orderIds] },
        packedAt: null,
        containerCount: 0,
        containers: { none: {} },
        lines: { none: { packedAt: { not: null } } },
      },
      select: { orderId: true },
    });
    const ids = untouched.map((row) => row.orderId);
    if (ids.length === 0) {
      return 0;
    }
    await this.prisma.packingLine.deleteMany({ where: { serviceDay, orderId: { in: ids } } });
    const { count } = await this.prisma.packingOrder.deleteMany({
      where: { serviceDay, orderId: { in: ids } },
    });
    return count;
  }
}
