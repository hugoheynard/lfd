import { Injectable, Logger } from "@nestjs/common";

import type {
  OperationReport,
  PostDeployOperation,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import { Clock } from "../../../platform/time/clock.js";
import type { PostDeployRun } from "../domain/post-deploy-run.js";
import { PostDeployRunNotFoundError } from "../domain/post-deploy-errors.js";
import { PostDeployRunRepository } from "../domain/post-deploy-run.repository.js";

/** La borne de la raison d'échec rangée : un message de pilote peut être long. */
const FAILURE_MAX_LENGTH = 500;

/**
 * **L'application en tâche** : hors de la requête qui l'a lancée (un `now`
 * par lot, § 7.6). L'avancement est écrit après chaque lot ; l'issue —
 * réussie ou en échec — est écrite à la fin. Un échec laisse écrit ce que les
 * lots précédents ont écrit : chaque ligne est idempotente, une nouvelle
 * simulation puis une nouvelle application reprennent là.
 */
@Injectable()
export class PostDeployExecution {
  private readonly logger = new Logger(PostDeployExecution.name);

  constructor(
    private readonly runs: PostDeployRunRepository,
    private readonly clock: Clock,
  ) {}

  async execute(runId: string, operation: PostDeployOperation, actor: string): Promise<void> {
    let report: OperationReport;
    try {
      report = await operation.apply({
        actor,
        progress: (partial) => this.update(runId, (run) => run.recordProgress(partial)),
      });
    } catch (error: unknown) {
      const reason = failureOf(error);
      this.logger.error(`Opération après déploiement « ${operation.key} » en échec : ${reason}`);
      await this.update(runId, (run) => run.fail(reason, this.clock.now()));
      return;
    }
    await this.update(runId, (run) => run.succeed(report, this.clock.now()));
  }

  private async update(runId: string, change: (run: PostDeployRun) => void): Promise<void> {
    const run = await this.runs.load(runId);
    if (run === null) {
      throw new PostDeployRunNotFoundError(runId);
    }
    change(run);
    await this.runs.save(run);
  }
}

function failureOf(error: unknown): string {
  const text = error instanceof Error ? `${error.name} : ${error.message}` : String(error);
  return text.length > FAILURE_MAX_LENGTH ? `${text.slice(0, FAILURE_MAX_LENGTH)}…` : text;
}
