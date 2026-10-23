import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  CollectionBatch,
  type CollectionBatchLine,
  type CollectionBatchState,
  type ConstitutionAuthor,
} from "../domain/entities/collection-batch.js";
import { CollectionBatchChangedConcurrentlyError } from "../domain/errors/collection-errors.js";
import type { CollectionBatchStatus } from "../domain/entities/collection-batch-status.js";
import { Bic } from "../domain/value-objects/bic.js";
import { Iban } from "../domain/value-objects/iban.js";
import { CollectionBatchRepository } from "../domain/ports/collection-batch.repository.js";
import { bankRejectionFromRow, sequenceFromRow } from "./collection-batch-row.mapper.js";

/**
 * Adaptateur d'écriture du lot. Les LIGNES et le FICHIER sont écrits à la
 * création et jamais réécrits : un `save` ultérieur ne touche que l'état et
 * ses tampons (qui, quand). L'IBAN de chaque ligne est scellé ici, comme celui
 * de `company_bank_accounts` ; il ne sort en clair que dans le XML stocké, qui
 * le porte par construction.
 *
 * Un lot déjà en base s'écrit **sous condition** : `WHERE id AND status = <statut
 * chargé>`. Zéro ligne touchée veut dire qu'un autre geste l'a fait changer
 * entre la lecture et l'écriture — refusé, jamais écrasé. Le statut chargé est
 * gardé ici, par agrégat, et pas dans le domaine : c'est une affaire de
 * persistance, pas une règle du lot.
 */
@Injectable()
export class PrismaCollectionBatchRepository extends CollectionBatchRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  /** Le statut lu en base pour chaque agrégat rendu par `load` (ou écrit par `save`). */
  private readonly persistedStatus = new WeakMap<CollectionBatch, CollectionBatchStatus>();

  async load(batchId: string): Promise<CollectionBatch | null> {
    const row = await this.prisma.collectionBatch.findUnique({
      where: { id: batchId },
      include: {
        lines: {
          orderBy: { rank: "asc" },
          include: {
            orders: { select: { orderId: true } },
            invoices: { select: { invoiceId: true, invoice: { select: { number: true } } } },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }
    const batch = CollectionBatch.rehydrate({
      id: row.id,
      legalEntityId: row.legalEntityId,
      scheme: row.scheme,
      cycle: { startsAt: row.cycleStartsAt, closesAt: row.cycleClosesAt },
      status: row.status,
      constituted: {
        at: row.constitutedAt,
        by: authorOf(row.constitutedBy, row.constitutedByStaffId),
      },
      deposited: stamp(row.depositedAt, row.depositedByStaffId),
      cancelled: stamp(row.cancelledAt, row.cancelledByStaffId),
      rejected: bankRejectionFromRow(row.rejectedAt, row.rejectedByStaffId, row.rejectionReason),
      unmandatedCompanies: row.unmandatedCompanies,
      lines: row.lines.map((line) => ({
        rank: line.rank,
        endToEndId: line.endToEndId,
        mandateId: line.mandateId,
        mandateReference: line.mandateReference,
        mandateSignedAt: line.mandateSignedAt,
        debtorCompanyId: line.debtorCompanyId,
        debtorName: line.debtorName,
        // Descellé ici, revalidé par le value object : le domaine ne voit jamais de chaîne nue.
        debtorIban: Iban.create(this.cipher.open(line.debtorIbanSealed)),
        debtorBic: line.debtorBic === null ? null : Bic.fromStored(line.debtorBic),
        sequence: sequenceFromRow(line.sequence),
        amountCents: line.amountCents,
        ordersTotalCents: line.ordersTotalCents,
        orderIds: line.orders.map((order) => order.orderId),
        invoices: line.invoices
          .map((link) => ({ invoiceId: link.invoiceId, number: link.invoice.number }))
          .sort((left, right) => left.number.localeCompare(right.number)),
        priorOrderCount: line.priorOrderCount,
      })),
      xml: row.xml,
      fileSha256: row.fileSha256,
      requestedCollectionDay: row.requestedCollectionDay?.toISOString().slice(0, 10) ?? null,
      postponedFromDay: row.postponedFromDay?.toISOString().slice(0, 10) ?? null,
      lastDownloadedAt: row.lastDownloadedAt,
    });
    this.persistedStatus.set(batch, row.status);
    return batch;
  }

  async save(batch: CollectionBatch): Promise<void> {
    const state = batch.toPersistence();
    const mutable = mutableColumns(state);
    const loaded = this.persistedStatus.get(batch);
    if (loaded !== undefined) {
      const { count } = await this.prisma.collectionBatch.updateMany({
        where: { id: state.id, status: loaded },
        data: mutable,
      });
      if (count === 0) {
        throw new CollectionBatchChangedConcurrentlyError(state.id, loaded);
      }
      this.persistedStatus.set(batch, state.status);
      return;
    }
    await this.create(batch);
  }

  /**
   * Un lot qui n'a pas été chargé est un lot NEUF. S'il existait déjà, la clé
   * primaire refuse : on n'écrase pas un lot qu'on n'a pas lu.
   */
  private async create(batch: CollectionBatch): Promise<void> {
    const state = batch.toPersistence();
    const mutable = mutableColumns(state);
    await this.prisma.collectionBatch.create({
      data: {
        id: state.id,
        legalEntityId: state.legalEntityId,
        scheme: state.scheme,
        cycleStartsAt: state.cycle.startsAt,
        cycleClosesAt: state.cycle.closesAt,
        constitutedAt: state.constituted.at,
        constitutedBy: state.constituted.by.kind,
        constitutedByStaffId:
          state.constituted.by.kind === "staff" ? state.constituted.by.staffId : null,
        unmandatedCompanies: [...state.unmandatedCompanies],
        xml: state.xml,
        fileSha256: state.fileSha256,
        // Un jour local écrit à minuit UTC : la colonne est un DATE, sans fuseau.
        requestedCollectionDay:
          state.requestedCollectionDay === null
            ? null
            : new Date(`${state.requestedCollectionDay}T00:00:00.000Z`),
        postponedFromDay:
          state.postponedFromDay === null
            ? null
            : new Date(`${state.postponedFromDay}T00:00:00.000Z`),
        ...mutable,
      },
    });
    await this.prisma.collectionBatchLine.createMany({
      data: state.lines.map((line) => this.lineColumns(state.id, line)),
    });
    // Les factures qu'une ligne encaisse (E4) : écrites avec elle, jamais réécrites.
    await this.prisma.collectionBatchLineInvoice.createMany({
      data: state.lines.flatMap((line) =>
        line.invoices.map((invoice) => ({
          batchId: state.id,
          lineRank: line.rank,
          invoiceId: invoice.invoiceId,
        })),
      ),
    });
    this.persistedStatus.set(batch, state.status);
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
      debtorIbanSealed: this.cipher.seal(line.debtorIban.value),
      debtorIbanLast4: line.debtorIban.last4(),
      debtorBic: line.debtorBic?.value ?? null,
      sequence: line.sequence,
      amountCents: line.amountCents,
      ordersTotalCents: line.ordersTotalCents,
      orderCount: line.orderIds.length,
      priorOrderCount: line.priorOrderCount,
    };
  }
}

/** L'état et ses tampons : les seules colonnes qu'un `save` réécrit. */
function mutableColumns(state: CollectionBatchState) {
  return {
    status: state.status,
    depositedAt: state.deposited?.at ?? null,
    depositedByStaffId: state.deposited?.staffId ?? null,
    cancelledAt: state.cancelled?.at ?? null,
    cancelledByStaffId: state.cancelled?.staffId ?? null,
    rejectedAt: state.rejected?.at ?? null,
    rejectedByStaffId: state.rejected?.staffId ?? null,
    rejectionReason: state.rejected?.reason ?? null,
    lastDownloadedAt: state.lastDownloadedAt,
  };
}

function stamp(at: Date | null, staffId: string | null): { at: Date; staffId: string } | null {
  return at === null || staffId === null ? null : { at, staffId };
}

/** `constituted_by` relu : le `CHECK` lie la fiche à `staff`, le domaine le revérifie. */
function authorOf(kind: string, staffId: string | null): ConstitutionAuthor {
  if (kind === "system" && staffId === null) {
    return { kind: "system" };
  }
  if (kind === "staff" && staffId !== null) {
    return { kind: "staff", staffId };
  }
  throw new CorruptBatchAuthorError(kind);
}

/** Inatteignable tant que `collection_batch_constituted_by_author` existe. */
class CorruptBatchAuthorError extends TechnicalError {
  constructor(kind: string) {
    super(
      "accounting.collection.corrupt_author",
      `Un lot porte l'auteur « ${kind} » sans la fiche qui va avec (ou l'inverse) : la contrainte collection_batch_constituted_by_author a été levée. Prévenir la technique.`,
    );
  }
}
