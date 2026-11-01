import { z } from "zod";

import {
  Prisma,
  type PostDeployRun as PostDeployRunRow,
} from "../../../platform/database/client/client.js";
import { CorruptedRecordError } from "../../../platform/database/json-columns.js";
import type {
  PostDeployRunSnapshot,
  PostDeployRunState,
  RunReport,
} from "../domain/post-deploy-run.js";

const STATES = ["simulated", "running", "succeeded", "failed", "interrupted"] as const;
const stateSchema = z.enum(STATES);

const reportSchema = z.object({
  writable: z.number().int(),
  byHand: z.number().int(),
  summary: z.array(z.string()),
  sample: z.array(z.string()),
});

function readReport(value: unknown, runId: string, column: string): RunReport {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) {
    throw new CorruptedRecordError(`ops.post_deploy_runs.${column} (${runId})`);
  }
  return parsed.data;
}

function readState(value: string, runId: string): PostDeployRunState {
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) {
    throw new CorruptedRecordError(`ops.post_deploy_runs.state (${runId})`);
  }
  return parsed.data;
}

/** Ligne → instantané du domaine ; les rapports JSON sont relus, jamais crus. */
export function toSnapshot(row: PostDeployRunRow): PostDeployRunSnapshot {
  return {
    id: row.id,
    operationKey: row.operationKey,
    state: readState(row.state, row.id),
    revision: row.revision,
    simulatedBy: row.simulatedBy,
    simulatedAt: row.simulatedAt,
    simulationReport: readReport(row.simulationReport, row.id, "simulation_report"),
    startedAt: row.startedAt,
    progressReport:
      row.progressReport === null
        ? null
        : readReport(row.progressReport, row.id, "progress_report"),
    finishedAt: row.finishedAt,
    failure: row.failure,
  };
}

/** Instantané → colonnes. Les rapports sont recopiés en objets JSON simples. */
export function toColumns(
  snapshot: PostDeployRunSnapshot,
): Omit<Prisma.PostDeployRunUncheckedCreateInput, "id"> {
  return {
    operationKey: snapshot.operationKey,
    state: snapshot.state,
    revision: snapshot.revision,
    simulatedBy: snapshot.simulatedBy,
    simulatedAt: snapshot.simulatedAt,
    simulationReport: jsonReport(snapshot.simulationReport),
    startedAt: snapshot.startedAt,
    progressReport:
      snapshot.progressReport === null ? Prisma.DbNull : jsonReport(snapshot.progressReport),
    finishedAt: snapshot.finishedAt,
    failure: snapshot.failure,
  };
}

function jsonReport(report: RunReport): Prisma.InputJsonObject {
  return {
    writable: report.writable,
    byHand: report.byHand,
    summary: [...report.summary],
    sample: [...report.sample],
  };
}
