import type { PostDeployReportView, PostDeployRunView } from "@lfd/ops-contract";

import {
  SIMULATION_FRESHNESS_MINUTES,
  type PostDeployRunSnapshot,
  type RunReport,
} from "../domain/post-deploy-run.js";

const MS_PER_MINUTE = 60_000;

/**
 * Domaine → vues. Champ à champ, exprès : un champ ajouté au passage ne part
 * pas vers l'écran sans qu'on l'ait décidé.
 */
export function reportView(report: RunReport): PostDeployReportView {
  return {
    writable: report.writable,
    byHand: report.byHand,
    summary: [...report.summary],
    sample: [...report.sample],
  };
}

export function runView(run: PostDeployRunSnapshot): PostDeployRunView {
  return {
    id: run.id,
    operationKey: run.operationKey,
    state: run.state,
    revision: run.revision,
    simulatedBy: run.simulatedBy,
    simulatedAt: run.simulatedAt.toISOString(),
    applicableUntil: new Date(
      run.simulatedAt.getTime() + SIMULATION_FRESHNESS_MINUTES * MS_PER_MINUTE,
    ).toISOString(),
    simulation: reportView(run.simulationReport),
    startedAt: run.startedAt?.toISOString() ?? null,
    progress: run.progressReport === null ? null : reportView(run.progressReport),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    failure: run.failure,
  };
}
