import { Injectable } from "@nestjs/common";

import { readStringMapColumn } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ServiceDay } from "../../day/index.js";
import { type ProvisionalPrint, plainChoiceOf } from "../domain/entities/provisional-print.js";
import { ProvisionalPrintLedger } from "../domain/ports/provisional-print.ledger.js";
import {
  ProvisionalPrintPruner,
  type StaleProvisionalPrint,
} from "../domain/ports/provisional-print.pruner.js";
import {
  type ProvisionalPrintSummary,
  ProvisionalPrintsReader,
} from "../domain/ports/provisional-prints.reader.js";

const SUMMARY = {
  id: true,
  run: true,
  printedAt: true,
  printedBy: true,
  commerceVersion: true,
  functionSheetIds: true,
} as const;

interface SummaryRow {
  readonly id: string;
  readonly run: number;
  readonly printedAt: Date;
  readonly printedBy: string;
  readonly commerceVersion: bigint;
  readonly functionSheetIds: readonly string[];
}

function summaryOf(row: SummaryRow): ProvisionalPrintSummary {
  return { ...row, commerceVersion: Number(row.commerceVersion) };
}

/** Les impressions provisoires, dans `production.provisional_print` : l'écriture. */
@Injectable()
export class PrismaProvisionalPrintLedger extends ProvisionalPrintLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lastRunOf(day: ServiceDay): Promise<number> {
    const found = await this.prisma.productionProvisionalPrint.aggregate({
      where: { serviceDay: day.value },
      _max: { run: true },
    });
    return found._max.run ?? 0;
  }

  async record(print: ProvisionalPrint): Promise<boolean> {
    const { state } = print;
    // `ON CONFLICT DO NOTHING` plutôt qu'une violation levée : dans la
    // transaction de l'appelant, un refus d'unicité l'annulerait tout entière.
    const { count } = await this.prisma.productionProvisionalPrint.createMany({
      data: [
        {
          id: state.id,
          serviceDay: state.serviceDay,
          run: state.run,
          commerceVersion: BigInt(state.commerceVersion),
          printedAt: state.printedAt,
          printedBy: state.printedBy,
          orderFingerprints: Object.fromEntries(state.orderFingerprints),
          parts: { ...plainChoiceOf(state.choice) },
          functionSheetIds: [...state.functionSheetIds],
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }
}

/** Les impressions provisoires d'une journée : la lecture. */
@Injectable()
export class PrismaProvisionalPrintsReader extends ProvisionalPrintsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofDay(day: ServiceDay): Promise<readonly ProvisionalPrintSummary[]> {
    const rows = await this.prisma.productionProvisionalPrint.findMany({
      where: { serviceDay: day.value },
      select: SUMMARY,
      orderBy: { run: "asc" },
    });
    return rows.map(summaryOf);
  }

  async find(day: ServiceDay, id: string): Promise<ProvisionalPrintSummary | null> {
    const row = await this.prisma.productionProvisionalPrint.findFirst({
      where: { serviceDay: day.value, id },
      select: SUMMARY,
    });
    return row === null ? null : summaryOf(row);
  }

  async fingerprintsOf(day: ServiceDay, run: number): Promise<ReadonlyMap<string, string> | null> {
    const row = await this.prisma.productionProvisionalPrint.findUnique({
      where: { serviceDay_run: { serviceDay: day.value, run } },
      select: { orderFingerprints: true },
    });
    if (row === null) {
      return null;
    }
    const map = readStringMapColumn(
      row.orderFingerprints,
      "production.provisional_print.order_fingerprints",
    );
    return new Map(Object.entries(map));
  }
}

/**
 * Le balayage des impressions des journées passées. Une suppression PHYSIQUE,
 * et c'est permis : une impression provisoire n'est pas un agrégat métier ni
 * le papier officiel, c'est le fil d'une journée qui n'a plus d'usage.
 */
@Injectable()
export class PrismaProvisionalPrintPruner extends ProvisionalPrintPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async staleBefore(day: string): Promise<readonly StaleProvisionalPrint[]> {
    return this.prisma.productionProvisionalPrint.findMany({
      where: { serviceDay: { lt: day } },
      select: { id: true, serviceDay: true, run: true },
    });
  }

  async forget(ids: readonly string[]): Promise<number> {
    const { count } = await this.prisma.productionProvisionalPrint.deleteMany({
      where: { id: { in: [...ids] } },
    });
    return count;
  }
}
