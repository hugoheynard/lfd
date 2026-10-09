import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { ReturnableLine, ReturnableLineRegime } from "../domain/entities/collection-return.js";
import { ReturnableLinesReader } from "../domain/ports/returnable-lines.reader.js";
import type { SequenceType } from "../domain/services/pain008-document.js";

/** Ce qu'on lit d'une ligne : JAMAIS `debtorIbanSealed`. */
const LINE_SELECT = {
  batchId: true,
  rank: true,
  endToEndId: true,
  amountCents: true,
  mandateId: true,
  mandateReference: true,
  sequence: true,
  debtorCompanyId: true,
  debtorName: true,
  batch: {
    select: { status: true, scheme: true, cycleClosesAt: true, requestedCollectionDay: true },
  },
  statement: { select: { id: true } },
  _count: { select: { invoices: true } },
} as const;

/** Lecture des lignes de lot qu'un retour vise. */
@Injectable()
export class PrismaReturnableLinesReader extends ReturnableLinesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lineOf(batchId: string, rank: number): Promise<ReturnableLine | null> {
    const row = await this.prisma.collectionBatchLine.findUnique({
      where: { batchId_rank: { batchId, rank } },
      select: LINE_SELECT,
    });
    return row === null ? null : toLine(row);
  }

  async byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReturnableLine>> {
    const rows = await this.prisma.collectionBatchLine.findMany({
      where: { endToEndId: { in: [...endToEndIds] } },
      select: LINE_SELECT,
    });
    return new Map(rows.map((row) => [row.endToEndId, toLine(row)]));
  }

  async alreadyReturned(endToEndIds: readonly string[]): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.collectionReturn.findMany({
      where: { endToEndId: { in: [...endToEndIds] } },
      select: { endToEndId: true },
    });
    return new Set(rows.map((row) => row.endToEndId));
  }
}

type LineRow = Prisma.CollectionBatchLineGetPayload<{ select: typeof LINE_SELECT }>;

function toLine(row: LineRow): ReturnableLine {
  return {
    batchId: row.batchId,
    rank: row.rank,
    endToEndId: row.endToEndId,
    batchStatus: row.batch.status,
    scheme: row.batch.scheme,
    cycleClosesAt: row.batch.cycleClosesAt,
    amountCents: row.amountCents,
    mandateId: row.mandateId,
    mandateReference: row.mandateReference,
    sequence: sequenceOf(row.sequence),
    debtorCompanyId: row.debtorCompanyId,
    debtorName: row.debtorName,
    regime: regimeOf(row),
    requestedCollectionDay: row.batch.requestedCollectionDay?.toISOString().slice(0, 10) ?? null,
  };
}

function regimeOf(row: LineRow): ReturnableLineRegime {
  if (row._count.invoices > 0) {
    return "invoices";
  }
  return row.statement === null ? "legacy" : "statement";
}

/** Inatteignable tant que le CHECK `collection_batch_line_sequence` existe. */
function sequenceOf(raw: string): SequenceType {
  if (raw === "RCUR" || raw === "OOFF") {
    return raw;
  }
  throw new UnknownLineSequenceError(raw);
}

class UnknownLineSequenceError extends TechnicalError {
  constructor(raw: string) {
    super(
      "accounting.collection_return.unknown_sequence",
      `Séquence de ligne inconnue « ${raw} » : le CHECK collection_batch_line_sequence n'admet que RCUR et OOFF.`,
    );
  }
}
