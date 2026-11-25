import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { DeliveryNote, type DeliveryNoteState } from "../domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../domain/ports/delivery-note.repository.js";
import { DeliveryNoteVersionKeeper } from "../domain/ports/delivery-note-version.keeper.js";
import { versionToKeep } from "../domain/services/delivery-note-version.js";
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
 *
 * **Chaque version du contenu se fige ici** (plan du reliquat, § 5 ter) : à
 * la naissance du bon, et chaque fois que sa `content_version` monte par
 * rapport à celle de la base, lue juste avant l'écriture — sous le verrou de
 * la commande que tout écrivain tient déjà. Le gardien compose et range la
 * version dans la même transaction, APRÈS les lignes : il fige ce qui vient
 * d'être écrit. Aucun écrivain du bon ne peut l'oublier.
 */
@Injectable()
export class PrismaDeliveryNoteRepository extends DeliveryNoteRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly versions: DeliveryNoteVersionKeeper,
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
    const previous = await this.prisma.deliveryNote.findUnique({
      where: { id: head.id },
      select: { contentVersion: true },
    });
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
    await this.keepVersion(note, previous?.contentVersion ?? null, columns.contentVersion);
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
    await this.keepVersion(note, null, progressColumns(head).contentVersion);
    return true;
  }

  private async keepVersion(
    note: DeliveryNote,
    previous: number | null,
    written: number,
  ): Promise<void> {
    const toKeep = versionToKeep(previous, written, note.contentChangeCause);
    if (toKeep === null) {
      return;
    }
    const { id, orderId, number } = note.toState();
    await this.versions.keep({ id, orderId, number }, toKeep.contentVersion, toKeep.cause);
  }

  private async replaceLines(noteId: string, lines: DeliveryNoteState["lines"]): Promise<void> {
    await this.prisma.deliveryNoteLine.deleteMany({ where: { noteId } });
    await this.prisma.deliveryNoteLine.createMany({
      data: lines.map((line) => ({ id: this.ids.next(), noteId, ...line })),
    });
  }
}
