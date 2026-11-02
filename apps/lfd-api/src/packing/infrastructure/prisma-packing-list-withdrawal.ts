import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingListWithdrawal } from "../domain/ports/packing-list-withdrawal.js";
import { assertInsideUnitOfWork } from "./packing-lock.js";

/** Une feuille de la journée : la clé est la commande ET le rang de l'envoi (L3b). */
interface SheetKey {
  readonly orderId: string;
  readonly rank: number;
}

/**
 * L'adaptateur Prisma du retrait d'une liste défaite. Il tourne dans l'unité
 * de travail que la garde du relais ouvre pour la livraison du fait.
 *
 * 🔴 **Sous verrou, par feuille** (audit du réassort, 2026-11-02). Le retrait
 * lisait les feuilles intouchées, puis effaçait par `orderId` seul, sans
 * verrou : une ligne mise au bac entre la lecture et l'effacement partait
 * avec la feuille, et un reliquat (rang > 1) intouché suivait une commande
 * touchée. Désormais : `FOR UPDATE` sur les feuilles visées, dans l'ordre des
 * clés — le verrou même que prend chaque geste au bac
 * (`PrismaPackingSheetRepository.lock`, vérifié le 2026-11-02) —, puis le
 * filtre relu SOUS le verrou, puis l'effacement par paires (commande, rang).
 *
 * ⚠️ **Encore un effacement**, et ce n'est pas un choix assumé : le retrait
 * par statut est demandé, mais la seule colonne de statut de la feuille,
 * `withdrawn_at`, est la pierre tombale de l'ANNULATION (plan A1) — le tirage
 * ne réinscrit pas une feuille qui la porte, le poste la montre « retirée » et
 * le commerce lit « withdrawn ». La reprendre ferait d'une réouverture une
 * annulation. Question remontée le 2026-11-02 ; en attendant, l'effacement
 * ne touche qu'une feuille vérifiée intouchée sous verrou : aucun geste ne
 * s'y perd. Une feuille retirée par l'annulation reste — c'est un geste.
 */
@Injectable()
export class PrismaPackingListWithdrawal extends PackingListWithdrawal {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async withdrawUntouched(serviceDay: string, orderIds: readonly string[]): Promise<number> {
    if (orderIds.length === 0) {
      return 0;
    }
    assertInsideUnitOfWork(`des feuilles de la journée ${serviceDay}`);
    await this.prisma.$queryRaw`
      SELECT "order_id" FROM "packing"."packing_order"
       WHERE "service_day" = ${serviceDay} AND "order_id" = ANY(${[...orderIds]}::text[])
       ORDER BY "order_id", "rank"
         FOR UPDATE`;
    const untouched: readonly SheetKey[] = await this.prisma.packingOrder.findMany({
      where: {
        serviceDay,
        orderId: { in: [...orderIds] },
        packedAt: null,
        // Une fiche dont le départ est décidé reste (E6b, plan E6 § 13).
        shortfallAuthorizedAt: null,
        // Une feuille retirée par l'annulation reste : sa pierre tombale
        // empêche le prochain tirage de la réinscrire (plan A1, § 2.2).
        withdrawnAt: null,
        containerCount: 0,
        containers: { none: {} },
        lines: { none: { packedAt: { not: null } } },
      },
      select: { orderId: true, rank: true },
    });
    if (untouched.length === 0) {
      return 0;
    }
    const sheets = untouched.map(({ orderId, rank }) => ({ serviceDay, orderId, rank }));
    await this.prisma.packingLine.deleteMany({ where: { OR: sheets } });
    const { count } = await this.prisma.packingOrder.deleteMany({ where: { OR: sheets } });
    return count;
  }
}
