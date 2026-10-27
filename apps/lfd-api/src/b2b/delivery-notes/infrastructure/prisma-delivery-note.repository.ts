import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { DeliveryNote, type DeliveryNoteState } from "../domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../domain/ports/delivery-note.repository.js";
import { dateOf, NOTE_INCLUDE, stateOf } from "./delivery-note.rows.js";
import { termsColumns } from "./delivery-note-terms.columns.js";

/** Les colonnes qui bougent avec l'état du BL. */
function progressColumns(head: Omit<DeliveryNoteState, "lines">) {
  return {
    status: head.status,
    plannedAt: head.plannedAt,
    voidedAt: head.voidedAt,
    preparedAt: head.preparedAt,
    handedOverAt: head.handedOverAt,
    receivedOn: dateOf(head.receivedOn),
    ...termsColumns(head.terms),
    contentVersion: head.contentVersion ?? 1,
    printedVersion: head.printed?.version ?? null,
    printedAt: head.printed?.at ?? null,
    printedBy: head.printed?.by ?? null,
  };
}

/**
 * Adaptateur Prisma des bons de livraison. Il ne décide de rien : l'agrégat a
 * déjà refusé ce qui devait l'être, et les CHECK d'état de la base
 * (`20261024210000`) refusent ce qui lui aurait échappé.
 *
 * `save` remplace les lignes (supprimer puis recréer), comme la révision le
 * fait des lignes d'une commande : un BL prévu est un brouillon réécrit à
 * chaque arrêt (plan E1, § 6). Le BL lui-même n'est jamais supprimé.
 *
 * Il injecte `PrismaService`, routé vers la transaction ambiante : il écrit
 * dans l'unité de travail de son appelant (plan E2, § 8.3).
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
      include: NOTE_INCLUDE,
    });
    return rows.map((row) => DeliveryNote.rehydrate(stateOf(row)));
  }

  async save(note: DeliveryNote): Promise<void> {
    const { lines, ...head } = note.toState();
    const columns = progressColumns(head);
    await this.prisma.deliveryNote.upsert({
      where: { id: head.id },
      create: {
        id: head.id,
        orderId: head.orderId,
        rank: head.rank,
        number: head.number,
        serviceDay: dateOf(head.serviceDay),
        ...columns,
      },
      update: columns,
    });
    await this.replaceLines(head.id, lines);
  }

  async saveNew(note: DeliveryNote): Promise<boolean> {
    const { lines, ...head } = note.toState();
    // `ON CONFLICT DO NOTHING` : un conflit d'unicité ne fait pas avorter la
    // transaction de l'appelant, il rend 0.
    const { count } = await this.prisma.deliveryNote.createMany({
      data: [
        {
          id: head.id,
          orderId: head.orderId,
          rank: head.rank,
          number: head.number,
          serviceDay: dateOf(head.serviceDay),
          ...progressColumns(head),
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) {
      return false;
    }
    await this.replaceLines(head.id, lines);
    return true;
  }

  private async replaceLines(noteId: string, lines: DeliveryNoteState["lines"]): Promise<void> {
    await this.prisma.deliveryNoteLine.deleteMany({ where: { noteId } });
    await this.prisma.deliveryNoteLine.createMany({
      data: lines.map((line) => ({ id: this.ids.next(), noteId, ...line })),
    });
  }
}
