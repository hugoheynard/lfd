import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ServiceDay } from "../../day/index.js";
import {
  LineStep,
  type LineStepKey,
  type LineStepState,
  type LineStepStatus,
} from "../domain/entities/line-step.js";
import { LineStepChangedMeanwhileError } from "../domain/errors/line-step-errors.js";
import {
  AutomaticStepChecks,
  DayLineStepsReader,
  LineStepRepository,
} from "../domain/ports/line-step.ports.js";

const STEP_COLUMNS = {
  serviceDay: true,
  sku: true,
  workstationId: true,
  status: true,
  reason: true,
  checkedAt: true,
  checkedByStaffId: true,
  checkedByName: true,
  version: true,
} as const;

/** Une ligne de `production_line_step`, telle que {@link STEP_COLUMNS} la lit. */
interface StepRow {
  readonly serviceDay: string;
  readonly sku: string;
  readonly workstationId: string;
  readonly status: string;
  readonly reason: string | null;
  readonly checkedAt: Date;
  readonly checkedByStaffId: string;
  readonly checkedByName: string | null;
  readonly version: number;
}

/** Le statut rangé ; le CHECK de la table n'en admet pas d'autre. */
function statusOf(raw: string): LineStepStatus {
  return raw === "red" || raw === "undone" ? raw : "done";
}

function stateOf(row: StepRow): LineStepState {
  return {
    serviceDay: row.serviceDay,
    sku: row.sku,
    workstationId: row.workstationId,
    status: statusOf(row.status),
    reason: row.reason,
    checked: { at: row.checkedAt, staffId: row.checkedByStaffId, name: row.checkedByName },
    version: row.version,
  };
}

function keyOf(key: LineStepKey) {
  return {
    serviceDay_sku_workstationId: {
      serviceDay: key.serviceDay,
      sku: key.sku,
      workstationId: key.workstationId,
    },
  };
}

/** Le dépôt des étapes : l'agrégat entier, sous sa clé. Aucun type `Prisma.*` ne sort d'ici. */
@Injectable()
export class PrismaLineStepRepository extends LineStepRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(key: LineStepKey): Promise<LineStep | null> {
    const row = await this.prisma.productionLineStep.findUnique({
      where: keyOf(key),
      select: STEP_COLUMNS,
    });
    return row === null ? null : LineStep.fromState(stateOf(row));
  }

  async save(step: LineStep): Promise<void> {
    const state = step.state;
    const columns = {
      status: state.status,
      reason: state.reason,
      checkedAt: state.checked.at,
      checkedByStaffId: state.checked.staffId,
      checkedByName: state.checked.name,
      version: state.version,
    };
    if (step.loadedVersion === null) {
      await this.prisma.productionLineStep.create({
        data: {
          serviceDay: state.serviceDay,
          sku: state.sku,
          workstationId: state.workstationId,
          ...columns,
        },
      });
      return;
    }
    const { count } = await this.prisma.productionLineStep.updateMany({
      where: {
        serviceDay: state.serviceDay,
        sku: state.sku,
        workstationId: state.workstationId,
        version: step.loadedVersion,
      },
      data: columns,
    });
    if (count === 0) {
      throw new LineStepChangedMeanwhileError();
    }
  }
}

/** Toutes les étapes d'une journée, quel que soit leur statut. */
@Injectable()
export class PrismaDayLineStepsReader extends DayLineStepsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async allOf(day: ServiceDay): Promise<readonly LineStepState[]> {
    const rows = await this.prisma.productionLineStep.findMany({
      where: { serviceDay: day.value },
      select: STEP_COLUMNS,
      orderBy: { checkedAt: "asc" },
    });
    return rows.map(stateOf);
  }
}

/** La coche d'office : une insertion, le conflit sur la clé ignoré. */
@Injectable()
export class PrismaAutomaticStepChecks extends AutomaticStepChecks {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async checkIfAbsent(keys: readonly LineStepKey[], at: Date, author: string): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.productionLineStep.createMany({
      data: keys.map((key) => ({
        serviceDay: key.serviceDay,
        sku: key.sku,
        workstationId: key.workstationId,
        status: "done",
        reason: null,
        checkedAt: at,
        checkedByStaffId: author,
        checkedByName: null,
        version: 1,
      })),
      skipDuplicates: true,
    });
    return count;
  }
}
