import type { CollectionBatchView, CollectionExclusionView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CollectionBatchReader,
  type StoredBatchFile,
} from "../domain/ports/collection-batch.reader.js";
import type { BatchCsvLine } from "../domain/services/collection-batch-csv.js";

/** Lecture des lots — jamais le fichier dans la liste, il est lourd. */
@Injectable()
export class PrismaCollectionBatchReader extends CollectionBatchReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(legalEntityId: string): Promise<readonly CollectionBatchView[]> {
    const rows = await this.prisma.collectionBatch.findMany({
      where: { legalEntityId },
      orderBy: [{ constitutedAt: "desc" }, { scheme: "asc" }],
      select: {
        id: true,
        scheme: true,
        cycleStartsAt: true,
        cycleClosesAt: true,
        status: true,
        constitutedAt: true,
        depositedAt: true,
        cancelledAt: true,
        unmandatedCompanies: true,
        lines: { select: { amountCents: true, orderCount: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      scheme: row.scheme,
      cycleStartsAt: row.cycleStartsAt.toISOString(),
      cycleClosesAt: row.cycleClosesAt.toISOString(),
      status: row.status,
      constitutedAt: row.constitutedAt.toISOString(),
      depositedAt: row.depositedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      lineCount: row.lines.length,
      orderCount: row.lines.reduce((sum, line) => sum + line.orderCount, 0),
      totalCents: row.lines.reduce((sum, line) => sum + line.amountCents, 0),
      unmandatedCompanies: row.unmandatedCompanies,
      depositable: row.lines.length > 0 && row.unmandatedCompanies.length === 0,
    }));
  }

  async exclusions(): Promise<readonly CollectionExclusionView[]> {
    const rows = await this.prisma.orderCollection.findMany({
      where: { state: "excluded" },
      select: { orderId: true, amountCents: true, exclusionReason: true },
    });
    const orders = await this.prisma.order.findMany({
      where: { id: { in: rows.map((row) => row.orderId) } },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        company: { select: { raisonSociale: true } },
      },
    });
    const orderOf = new Map(orders.map((order) => [order.id, order]));
    return rows
      .flatMap((row) => {
        const order = orderOf.get(row.orderId);
        if (order === undefined || row.exclusionReason === null) {
          return [];
        }
        return [
          {
            orderId: row.orderId,
            orderNumber: order.orderNumber,
            companyName: order.company?.raisonSociale ?? "",
            placedAt: order.createdAt.toISOString(),
            amountCents: row.amountCents,
            reason: row.exclusionReason,
          },
        ];
      })
      .sort((left, right) => left.placedAt.localeCompare(right.placedAt));
  }

  async file(batchId: string): Promise<StoredBatchFile | null> {
    const row = await this.prisma.collectionBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        scheme: true,
        cycleClosesAt: true,
        status: true,
        unmandatedCompanies: true,
        xml: true,
        fileSha256: true,
        legalEntity: { select: { siren: true } },
        _count: { select: { lines: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      batchId: row.id,
      scheme: row.scheme,
      creditorSiren: row.legalEntity.siren,
      cycleClosesAt: row.cycleClosesAt,
      depositable: row._count.lines > 0 && row.unmandatedCompanies.length === 0,
      status: row.status,
      xml: row.xml,
      fileSha256: row.fileSha256,
    };
  }

  async auditLines(batchId: string): Promise<readonly BatchCsvLine[]> {
    const lines = await this.prisma.collectionBatchLine.findMany({
      where: { batchId },
      orderBy: { rank: "asc" },
      include: { orders: { select: { orderId: true } } },
    });
    const orderIds = lines.flatMap((line) => line.orders.map((order) => order.orderId));
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, orderNumber: true },
    });
    const numberOf = new Map(orders.map((order) => [order.id, order.orderNumber]));
    return lines.map((line) => ({
      rank: line.rank,
      endToEndId: line.endToEndId,
      debtorName: line.debtorName,
      debtorIbanLast4: line.debtorIbanLast4,
      mandateReference: line.mandateReference,
      sequence: line.sequence,
      amountCents: line.amountCents,
      orderCount: line.orderCount,
      priorOrderCount: line.priorOrderCount,
      orderNumbers: line.orders
        .flatMap((order) => numberOf.get(order.orderId) ?? [])
        .sort((left, right) => left.localeCompare(right)),
    }));
  }
}
