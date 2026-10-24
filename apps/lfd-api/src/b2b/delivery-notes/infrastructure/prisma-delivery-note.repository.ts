import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { DeliveryNote } from "../domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../domain/ports/delivery-note.repository.js";

const LINE_COLUMNS = {
  sku: true,
  productName: true,
  unitPriceMillicents: true,
  vatRate: true,
  quantity: true,
  lineTotalCents: true,
  unitPriceTtcCents: true,
  lineTotalTtcCents: true,
} as const;

/**
 * Adaptateur Prisma des bons de livraison. Il ne décide de rien : l'agrégat a
 * déjà refusé ce qui devait l'être.
 *
 * `save` remplace les lignes d'un BL prévu (supprimer puis recréer), comme la
 * révision le fait des lignes d'une commande : un BL prévu est un brouillon
 * réécrit à chaque arrêt (plan E1, § 6). Le BL lui-même n'est jamais supprimé.
 */
@Injectable()
export class PrismaDeliveryNoteRepository extends DeliveryNoteRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async loadForOrders(orderIds: readonly string[]): Promise<readonly DeliveryNote[]> {
    const rows = await this.prisma.deliveryNote.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: [{ orderId: "asc" }, { rank: "asc" }],
      include: { lines: { orderBy: { id: "asc" }, select: LINE_COLUMNS } },
    });
    return rows.map((row) =>
      DeliveryNote.rehydrate({
        id: row.id,
        orderId: row.orderId,
        rank: row.rank,
        number: row.number,
        status: row.status,
        plannedAt: row.plannedAt,
        voidedAt: row.voidedAt,
        lines: row.lines.map((line) => ({ ...line, vatRate: line.vatRate.toNumber() })),
      }),
    );
  }

  async save(note: DeliveryNote): Promise<void> {
    const { lines, ...head } = note.toState();
    const columns = {
      status: head.status,
      plannedAt: head.plannedAt,
      voidedAt: head.voidedAt,
    };
    await this.prisma.deliveryNote.upsert({
      where: { id: head.id },
      create: {
        id: head.id,
        orderId: head.orderId,
        rank: head.rank,
        number: head.number,
        ...columns,
      },
      update: columns,
    });
    await this.prisma.deliveryNoteLine.deleteMany({ where: { noteId: head.id } });
    await this.prisma.deliveryNoteLine.createMany({
      data: lines.map((line) => ({ id: this.ids.next(), noteId: head.id, ...line })),
    });
  }
}
