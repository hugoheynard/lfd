import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { CollectionBatch, type CollectionBatchLine } from "../domain/entities/collection-batch.js";
import { CollectionBatchRepository } from "../domain/ports/collection-batch.repository.js";
import type { SequenceType } from "../domain/services/pain008-document.js";

const SEQUENCES: readonly SequenceType[] = ["RCUR", "OOFF"];

/**
 * Adaptateur d'écriture du lot. Les LIGNES et le FICHIER sont écrits à la
 * création et jamais réécrits : un `save` ultérieur ne touche que l'état et
 * ses tampons (qui, quand). L'IBAN de chaque ligne est scellé ici, comme celui
 * de `company_bank_accounts` ; il ne sort en clair que dans le XML stocké, qui
 * le porte par construction.
 */
@Injectable()
export class PrismaCollectionBatchRepository extends CollectionBatchRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async load(batchId: string): Promise<CollectionBatch | null> {
    const row = await this.prisma.collectionBatch.findUnique({
      where: { id: batchId },
      include: {
        lines: { orderBy: { rank: "asc" }, include: { orders: { select: { orderId: true } } } },
      },
    });
    if (row === null) {
      return null;
    }
    return CollectionBatch.rehydrate({
      id: row.id,
      legalEntityId: row.legalEntityId,
      scheme: row.scheme,
      cycle: { startsAt: row.cycleStartsAt, closesAt: row.cycleClosesAt },
      status: row.status,
      constituted: { at: row.constitutedAt, staffId: row.constitutedByStaffId },
      deposited: stamp(row.depositedAt, row.depositedByStaffId),
      cancelled: stamp(row.cancelledAt, row.cancelledByStaffId),
      unmandatedCompanies: row.unmandatedCompanies,
      lines: row.lines.map((line) => ({
        rank: line.rank,
        endToEndId: line.endToEndId,
        mandateId: line.mandateId,
        mandateReference: line.mandateReference,
        mandateSignedAt: line.mandateSignedAt,
        debtorCompanyId: line.debtorCompanyId,
        debtorName: line.debtorName,
        debtorIban: this.cipher.open(line.debtorIbanSealed),
        debtorBic: line.debtorBic,
        sequence: sequenceOf(line.sequence),
        amountCents: line.amountCents,
        ordersTotalCents: line.ordersTotalCents,
        orderIds: line.orders.map((order) => order.orderId),
        priorOrderCount: line.priorOrderCount,
      })),
      xml: row.xml,
      fileSha256: row.fileSha256,
      requestedCollectionDay: row.requestedCollectionDay?.toISOString().slice(0, 10) ?? null,
    });
  }

  async save(batch: CollectionBatch): Promise<void> {
    const state = batch.toPersistence();
    const mutable = {
      status: state.status,
      depositedAt: state.deposited?.at ?? null,
      depositedByStaffId: state.deposited?.staffId ?? null,
      cancelledAt: state.cancelled?.at ?? null,
      cancelledByStaffId: state.cancelled?.staffId ?? null,
    };
    const exists = await this.prisma.collectionBatch.findUnique({
      where: { id: state.id },
      select: { id: true },
    });
    if (exists !== null) {
      await this.prisma.collectionBatch.update({ where: { id: state.id }, data: mutable });
      return;
    }
    await this.prisma.collectionBatch.create({
      data: {
        id: state.id,
        legalEntityId: state.legalEntityId,
        scheme: state.scheme,
        cycleStartsAt: state.cycle.startsAt,
        cycleClosesAt: state.cycle.closesAt,
        constitutedAt: state.constituted.at,
        constitutedByStaffId: state.constituted.staffId,
        unmandatedCompanies: [...state.unmandatedCompanies],
        xml: state.xml,
        fileSha256: state.fileSha256,
        // Un jour local écrit à minuit UTC : la colonne est un DATE, sans fuseau.
        requestedCollectionDay:
          state.requestedCollectionDay === null
            ? null
            : new Date(`${state.requestedCollectionDay}T00:00:00.000Z`),
        ...mutable,
      },
    });
    await this.prisma.collectionBatchLine.createMany({
      data: state.lines.map((line) => this.lineColumns(state.id, line)),
    });
  }

  private lineColumns(batchId: string, line: CollectionBatchLine) {
    return {
      batchId,
      rank: line.rank,
      endToEndId: line.endToEndId,
      mandateId: line.mandateId,
      mandateReference: line.mandateReference,
      mandateSignedAt: line.mandateSignedAt,
      debtorCompanyId: line.debtorCompanyId,
      debtorName: line.debtorName,
      debtorIbanSealed: this.cipher.seal(line.debtorIban),
      debtorIbanLast4: line.debtorIban.slice(-4),
      debtorBic: line.debtorBic,
      sequence: line.sequence,
      amountCents: line.amountCents,
      ordersTotalCents: line.ordersTotalCents,
      orderCount: line.orderIds.length,
      priorOrderCount: line.priorOrderCount,
    };
  }
}

function stamp(at: Date | null, staffId: string | null): { at: Date; staffId: string } | null {
  return at === null || staffId === null ? null : { at, staffId };
}

/** La base le tient par `CHECK` ; une autre valeur est une ligne corrompue. */
function sequenceOf(raw: string): SequenceType {
  const found = SEQUENCES.find((sequence) => sequence === raw);
  if (found === undefined) {
    throw new CorruptBatchLineError(raw);
  }
  return found;
}

/** Inatteignable tant que le `CHECK` existe ; on refuse plutôt que deviner une séquence. */
class CorruptBatchLineError extends TechnicalError {
  constructor(raw: string) {
    super(
      "accounting.collection.corrupt_line",
      `Une ligne de lot porte la séquence « ${raw} », ni RCUR ni OOFF : la contrainte collection_batch_line_sequence a été levée. Prévenir la technique.`,
    );
  }
}
