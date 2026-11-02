import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { alreadyReceivedBy, ResupplyReceipt } from "../domain/resupply-receipt.js";
import {
  ResupplyReceiptChangedMeanwhileError,
  UnreceivedReceiptNotPersistableError,
} from "../domain/resupply-receipt-errors.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { RECEIPT_LINES, receiptSnapshotOf } from "./resupply-receipt.row.js";
import { dayColumn } from "./day-column.js";
import { writeReceiptLines } from "./resupply-receipt-lines.writer.js";
import type { ResupplyTrace } from "../domain/resupply-trace.js";

function linesOf(receipt: ResupplyReceipt) {
  return receipt.lines.map((line, position) => ({
    sku: line.sku,
    label: line.label,
    expectedQuantity: line.expectedQuantity,
    // Un reçu écrit est reçu (garde de `save`) : chaque ligne porte son reçu.
    quantity: line.receivedQuantity ?? 0,
    saleUnit: line.saleUnit,
    position,
  }));
}

function updatedOf(change: ResupplyTrace) {
  return {
    updatedAt: change.at,
    updatedByStaffId: change.author.staffUserId,
    updatedByName: change.author.name,
    updatedByRole: change.author.role,
  };
}

/**
 * Adaptateur Prisma du reçu (`resupply_receipt` + ses lignes). Un reçu neuf
 * s'insère : l'index unique sur `resupply_id` refuse un second
 * « Réceptionner » concurrent, l'index partiel `resupply_receipt_unordered_key`
 * un second réassort sans commande du jour. Ensuite il se réécrit sous le
 * verrou de la version lue. Les lignes sont des parties de l'agrégat : en
 * retirer une la supprime ; le reçu, lui, ne se supprime jamais. Elles
 * s'écrivent par différence (`writeReceiptLines`) : une correction d'une
 * ligne n'en réécrit qu'une.
 */
@Injectable()
export class PrismaResupplyReceiptRepository extends ResupplyReceiptRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadUnordered(siteId: string, serviceDay: string): Promise<ResupplyReceipt | null> {
    const row = await this.prisma.resupplyReceipt.findFirst({
      where: { siteId, serviceDay: dayColumn(serviceDay), resupplyId: null },
      include: { lines: RECEIPT_LINES },
    });
    return row === null ? null : ResupplyReceipt.restore(receiptSnapshotOf(row));
  }

  async loadForResupply(siteId: string, resupplyId: string): Promise<ResupplyReceipt | null> {
    // Le point est dans le `where` : c'est le mur par point.
    const row = await this.prisma.resupplyReceipt.findFirst({
      where: { siteId, resupplyId },
      include: { lines: RECEIPT_LINES },
    });
    return row === null ? null : ResupplyReceipt.restore(receiptSnapshotOf(row));
  }

  async save(receipt: ResupplyReceipt): Promise<void> {
    const received = receipt.received;
    const change = receipt.lastChange;
    if (received === null || change === null) {
      throw new UnreceivedReceiptNotPersistableError();
    }
    if (receipt.version === 0) {
      await this.create(receipt, received, change);
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.resupplyReceipt.updateMany({
        where: { id: receipt.id, siteId: receipt.siteId, version: receipt.version },
        data: { version: receipt.version + 1, ...updatedOf(change) },
      });
      if (count === 0) {
        throw new ResupplyReceiptChangedMeanwhileError();
      }
      await writeReceiptLines(tx, receipt.id, linesOf(receipt));
    });
  }

  private async create(
    receipt: ResupplyReceipt,
    received: ResupplyTrace,
    change: ResupplyTrace,
  ): Promise<void> {
    try {
      await this.prisma.resupplyReceipt.create({
        data: {
          id: receipt.id,
          siteId: receipt.siteId,
          serviceDay: dayColumn(receipt.serviceDay),
          resupplyId: receipt.resupplyId,
          version: 1,
          receivedAt: received.at,
          receivedByStaffId: received.author.staffUserId,
          receivedByName: received.author.name,
          receivedByRole: received.author.role,
          ...updatedOf(change),
          lines: { create: linesOf(receipt) },
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      throw await this.refusalAfterRace(receipt);
    }
  }

  /**
   * Un autre poste a écrit le même reçu entre la lecture et l'écriture. Le
   * refus nomme le geste qui a gagné, relu en base — jamais un « un autre
   * poste, à l'instant » fabriqué (audit du réassort, 2026-11-02).
   */
  private async refusalAfterRace(receipt: ResupplyReceipt): Promise<Error> {
    if (receipt.resupplyId === null) {
      return new ResupplyReceiptChangedMeanwhileError();
    }
    const winner = await this.loadForResupply(receipt.siteId, receipt.resupplyId);
    const received = winner?.received ?? null;
    return received === null
      ? new ResupplyReceiptChangedMeanwhileError()
      : alreadyReceivedBy(received);
  }
}
