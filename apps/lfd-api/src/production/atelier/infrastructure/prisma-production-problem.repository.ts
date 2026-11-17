import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ServiceDay } from "../../day/index.js";
import {
  type ProblemMark,
  ProductionProblem,
  type ProductionProblemState,
} from "../domain/entities/production-problem.js";
import {
  DayProblemsReader,
  OpenProductionProblemsReader,
  ProductionProblemRepository,
} from "../domain/ports/production-problem.ports.js";

const PROBLEM_COLUMNS = {
  id: true,
  serviceDay: true,
  sku: true,
  expected: true,
  produced: true,
  reason: true,
  reportedAt: true,
  reportedByStaffId: true,
  reportedByName: true,
  resolvedAt: true,
  resolvedByStaffId: true,
  resolvedByName: true,
  version: true,
} as const;

/** Une ligne de `production_problem`, telle que {@link PROBLEM_COLUMNS} la lit. */
interface ProblemRow {
  readonly id: string;
  readonly serviceDay: string;
  readonly sku: string;
  readonly expected: number;
  readonly produced: number;
  readonly reason: string | null;
  readonly reportedAt: Date;
  readonly reportedByStaffId: string;
  readonly reportedByName: string | null;
  readonly resolvedAt: Date | null;
  readonly resolvedByStaffId: string | null;
  readonly resolvedByName: string | null;
  readonly version: number;
}

/** Ligne → état. Le CHECK de la table tient `resolved_at` et son auteur ensemble. */
function stateOf(row: ProblemRow): ProductionProblemState {
  const resolved: ProblemMark | null =
    row.resolvedAt === null || row.resolvedByStaffId === null
      ? null
      : { at: row.resolvedAt, staffId: row.resolvedByStaffId, name: row.resolvedByName };
  return {
    id: row.id,
    serviceDay: row.serviceDay,
    sku: row.sku,
    expected: row.expected,
    produced: row.produced,
    reason: row.reason,
    reported: { at: row.reportedAt, staffId: row.reportedByStaffId, name: row.reportedByName },
    resolved,
    version: row.version,
  };
}

/** État → colonnes écrites (sans l'`id`, clé de l'écriture). */
function columnsOf(state: ProductionProblemState) {
  return {
    serviceDay: state.serviceDay,
    sku: state.sku,
    expected: state.expected,
    produced: state.produced,
    reason: state.reason,
    reportedAt: state.reported.at,
    reportedByStaffId: state.reported.staffId,
    reportedByName: state.reported.name,
    resolvedAt: state.resolved?.at ?? null,
    resolvedByStaffId: state.resolved?.staffId ?? null,
    resolvedByName: state.resolved?.name ?? null,
    version: state.version,
  };
}

/** Le dépôt des problèmes : l'agrégat entier, sous son `id`. Aucun type `Prisma.*` ne sort d'ici. */
@Injectable()
export class PrismaProductionProblemRepository extends ProductionProblemRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(day: ServiceDay, sku: string): Promise<ProductionProblem | null> {
    const row = await this.prisma.productionProblem.findUnique({
      where: { serviceDay_sku: { serviceDay: day.value, sku } },
      select: PROBLEM_COLUMNS,
    });
    return row === null ? null : ProductionProblem.fromState(stateOf(row));
  }

  async loadById(id: string): Promise<ProductionProblem | null> {
    const row = await this.prisma.productionProblem.findUnique({
      where: { id },
      select: PROBLEM_COLUMNS,
    });
    return row === null ? null : ProductionProblem.fromState(stateOf(row));
  }

  async save(problem: ProductionProblem): Promise<void> {
    const columns = columnsOf(problem.state);
    await this.prisma.productionProblem.upsert({
      where: { id: problem.id },
      create: { id: problem.id, ...columns },
      update: columns,
    });
  }
}

/** Les problèmes ouverts d'une journée, filtrés en base. */
@Injectable()
export class PrismaOpenProductionProblemsReader extends OpenProductionProblemsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async openOf(day: ServiceDay): Promise<readonly ProductionProblemState[]> {
    const rows = await this.prisma.productionProblem.findMany({
      where: { serviceDay: day.value, resolvedAt: null },
      select: PROBLEM_COLUMNS,
      orderBy: { reportedAt: "asc" },
    });
    return rows.map(stateOf);
  }
}

/** Tous les problèmes d'une journée, ouverts et traités. */
@Injectable()
export class PrismaDayProblemsReader extends DayProblemsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async allOf(day: ServiceDay): Promise<readonly ProductionProblemState[]> {
    const rows = await this.prisma.productionProblem.findMany({
      where: { serviceDay: day.value },
      select: PROBLEM_COLUMNS,
    });
    return rows.map(stateOf);
  }
}
