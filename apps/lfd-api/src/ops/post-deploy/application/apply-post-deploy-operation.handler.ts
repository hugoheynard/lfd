import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../platform/events/background-work.js";
import type { PostDeployOperation } from "../../../platform/post-deploy/post-deploy-operation.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeployedRevision } from "../domain/deployed-revision.js";
import {
  PostDeployPredecessorPendingError,
  SimulationRequiredError,
} from "../domain/post-deploy-errors.js";
import { PostDeployRunRepository } from "../domain/post-deploy-run.repository.js";
import { ApplyPostDeployOperationCommand } from "./apply-post-deploy-operation.command.js";
import { PostDeployCatalogue } from "./post-deploy-catalogue.js";
import { PostDeployExecution } from "./post-deploy-execution.js";

/**
 * « Appliquer » : vérifie l'ordre (§ 7.1) et la simulation (§ 3.6), passe le
 * passage à `running` — l'index unique partiel refuse une seconde application
 * en cours —, puis détache l'écriture de la requête (§ 7.6) et rend l'id :
 * l'écran relit l'état, une reprise longue ne tient pas une requête ouverte.
 */
@CommandHandler(ApplyPostDeployOperationCommand)
export class ApplyPostDeployOperationHandler implements ICommandHandler<
  ApplyPostDeployOperationCommand,
  string
> {
  constructor(
    private readonly catalogue: PostDeployCatalogue,
    private readonly runs: PostDeployRunRepository,
    private readonly revision: DeployedRevision,
    private readonly clock: Clock,
    private readonly execution: PostDeployExecution,
    private readonly background: BackgroundWork,
  ) {}

  async execute(command: ApplyPostDeployOperationCommand): Promise<string> {
    const operation = this.catalogue.find(command.operationKey);
    await this.refuseWhilePredecessorPending(operation);
    const run = await this.runs.latestSimulationBy(operation.key, command.actor);
    if (run === null) {
      throw new SimulationRequiredError(operation.key);
    }
    run.start({ actor: command.actor, revision: this.revision.current(), at: this.clock.now() });
    await this.runs.save(run);
    void this.background.detach(
      () => this.execution.execute(run.id, operation, command.actor),
      `post-deploy:${operation.key}`,
    );
    return run.id;
  }

  /** Une opération qui doit passer avant, et dont la simulation trouve encore à écrire. */
  private async refuseWhilePredecessorPending(operation: PostDeployOperation): Promise<void> {
    for (const key of operation.after) {
      const report = await this.catalogue.find(key).simulate();
      if (report.writable > 0) {
        throw new PostDeployPredecessorPendingError(operation.key, key);
      }
    }
  }
}
