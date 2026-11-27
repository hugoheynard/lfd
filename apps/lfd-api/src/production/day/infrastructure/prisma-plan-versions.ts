import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CorruptedRecordError } from "../../../platform/database/json-columns.js";
import { PlanVersion, type PlanVersionCause } from "../domain/entities/plan-version.js";
import { PlanVersionLedger } from "../domain/ports/plan-version.ledger.js";
import { PlanVersionsReader } from "../domain/ports/plan-versions.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";
import {
  authorOfColumns,
  columnOfContent,
  contentOfColumn,
} from "./plan-version.content.column.js";

const CAUSES: ReadonlySet<string> = new Set<PlanVersionCause>([
  "closed",
  "auto_closed",
  "retaken",
  "order_revised",
  "order_withdrawn",
  "resupply_launched",
  "opened_by_resupply",
]);

function isCause(value: string): value is PlanVersionCause {
  return CAUSES.has(value);
}

/**
 * Les versions du plan, dans `production.plan_versions` : l'écriture. Un
 * `create` simple, par le client routé (dans la transaction du geste) : une
 * violation de `(service_day, version)` fait échouer le geste, et c'est
 * voulu — deux états sous le même numéro seraient un mensonge.
 */
@Injectable()
export class PrismaPlanVersionLedger extends PlanVersionLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async append(version: PlanVersion): Promise<void> {
    const record = version.toRecord();
    const by = record.recordedBy;
    await this.prisma.planVersion.create({
      data: {
        id: record.id,
        serviceDay: record.serviceDay,
        version: record.version,
        cause: record.cause,
        recordedAt: record.recordedAt,
        recordedByKind: by.kind,
        recordedById: by.kind === "staff" ? by.staffId : null,
        recordedByName: by.kind === "staff" ? by.name : null,
        closedAt: record.closedAt,
        printRun: record.printRun,
        contentVersion: record.contentVersion,
        content: columnOfContent(record.content),
      },
    });
  }
}

/** Les versions du plan d'une journée : la lecture, par l'index `(service_day, version)`. */
@Injectable()
export class PrismaPlanVersionsReader extends PlanVersionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async latestOf(day: ServiceDay): Promise<PlanVersion | null> {
    const row = await this.prisma.planVersion.findFirst({
      where: { serviceDay: day.value },
      orderBy: { version: "desc" },
    });
    if (row === null) {
      return null;
    }
    if (!isCause(row.cause)) {
      throw new CorruptedRecordError("production.plan_versions.cause");
    }
    return PlanVersion.restore({
      id: row.id,
      serviceDay: row.serviceDay,
      version: row.version,
      cause: row.cause,
      recordedAt: row.recordedAt,
      recordedBy: authorOfColumns(row.recordedByKind, row.recordedById, row.recordedByName),
      closedAt: row.closedAt,
      printRun: row.printRun,
      contentVersion: row.contentVersion,
      content: contentOfColumn(row.content),
    });
  }
}
