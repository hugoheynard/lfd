import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CollectionReturnsReader,
  type CollectionReturnRow,
} from "../domain/ports/collection-returns.reader.js";
import { RepresentedRejectionsReader } from "../domain/ports/represented-rejections.reader.js";
import { returnDayOf } from "./collection-return.mapper.js";

/** La ligne, sans son IBAN scellé : un retour n'en montre rien. */
const RETURN_SELECT = {
  id: true,
  endToEndId: true,
  kind: true,
  reasonCode: true,
  reasonLabel: true,
  returnedOn: true,
  amountCents: true,
  feeCents: true,
  source: true,
  recordedAt: true,
  resolution: true,
  resolutionNote: true,
  resolvedAt: true,
  line: {
    select: {
      batchId: true,
      rank: true,
      debtorCompanyId: true,
      debtorName: true,
      mandateId: true,
      mandateReference: true,
      batch: { select: { scheme: true, cycleClosesAt: true } },
    },
  },
} as const;

/** Lecture des retours, pour l'écran du lot et la fiche du payeur. */
@Injectable()
export class PrismaCollectionReturnsReader extends CollectionReturnsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofBatch(batchId: string): Promise<readonly CollectionReturnRow[]> {
    const rows = await this.prisma.collectionReturn.findMany({
      where: { line: { batchId } },
      orderBy: [{ recordedAt: "desc" }, { id: "asc" }],
      select: RETURN_SELECT,
    });
    return rows.map(toRow);
  }

  async ofPayer(companyId: string): Promise<readonly CollectionReturnRow[]> {
    const rows = await this.prisma.collectionReturn.findMany({
      where: { line: { debtorCompanyId: companyId } },
      orderBy: [{ returnedOn: "desc" }, { id: "asc" }],
      select: RETURN_SELECT,
    });
    return rows.map(toRow);
  }
}

type ReturnRecord = Prisma.CollectionReturnGetPayload<{ select: typeof RETURN_SELECT }>;

function toRow(row: ReturnRecord): CollectionReturnRow {
  return {
    id: row.id,
    endToEndId: row.endToEndId,
    batchId: row.line.batchId,
    lineRank: row.line.rank,
    scheme: row.line.batch.scheme,
    cycleClosesAt: row.line.batch.cycleClosesAt,
    debtorCompanyId: row.line.debtorCompanyId,
    debtorName: row.line.debtorName,
    mandateId: row.line.mandateId,
    mandateReference: row.line.mandateReference,
    kind: row.kind,
    reasonCode: row.reasonCode,
    reasonLabel: row.reasonLabel,
    returnedOn: returnDayOf(row.returnedOn),
    amountCents: row.amountCents,
    feeCents: row.feeCents,
    source: row.source,
    recordedAt: row.recordedAt,
    resolution: row.resolution,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt,
  };
}

/**
 * Le jour du rejet que re-présente une facture : le dernier retour
 * `represented` d'une ligne qui l'encaissait.
 */
@Injectable()
export class PrismaRepresentedRejectionsReader extends RepresentedRejectionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async rejectedDaysOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (invoiceIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.collectionBatchLineInvoice.findMany({
      where: {
        invoiceId: { in: [...invoiceIds] },
        line: { bankReturn: { resolution: "represented" } },
      },
      select: {
        invoiceId: true,
        line: { select: { bankReturn: { select: { returnedOn: true } } } },
      },
    });
    const days = new Map<string, string>();
    for (const row of rows) {
      const returnedOn = row.line.bankReturn?.returnedOn;
      if (returnedOn === undefined) {
        continue;
      }
      const day = returnDayOf(returnedOn);
      const known = days.get(row.invoiceId);
      if (known === undefined || known < day) {
        days.set(row.invoiceId, day);
      }
    }
    return days;
  }
}
