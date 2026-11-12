import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeployedRevision } from "../domain/deployed-revision.js";
import { PostDeployRun } from "../domain/post-deploy-run.js";
import { PostDeployRunRepository } from "../domain/post-deploy-run.repository.js";
import { PostDeployCatalogue } from "./post-deploy-catalogue.js";
import { SimulatePostDeployOperationCommand } from "./simulate-post-deploy-operation.command.js";

/** Le préfixe des identifiants de passage. */
export const POST_DEPLOY_RUN_ID_PREFIX = "postdeploy_";

/**
 * Simule, trace le passage `simulated`, rend son id — l'écran le relit.
 *
 * **Une fois par intention** : chaque passage est une ligne neuve ; le rejeu
 * de la même clé rend l'identifiant du premier, scellé avec son écriture.
 */
@CommandHandler(SimulatePostDeployOperationCommand)
export class SimulatePostDeployOperationHandler implements ICommandHandler<
  SimulatePostDeployOperationCommand,
  string
> {
  constructor(
    private readonly catalogue: PostDeployCatalogue,
    private readonly runs: PostDeployRunRepository,
    private readonly revision: DeployedRevision,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: SimulatePostDeployOperationCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.actor,
        key: command.intentKey,
        gesture: "ops.post-deploy-simulate",
        subject: command.operationKey,
      },
      CREATED_ID_REPLAY,
      (seal) => this.simulate(command, seal),
    );
  }

  private async simulate(
    command: SimulatePostDeployOperationCommand,
    seal: (runId: string) => Promise<void>,
  ): Promise<string> {
    const operation = this.catalogue.find(command.operationKey);
    const report = await operation.simulate();
    const run = PostDeployRun.simulated({
      id: `${POST_DEPLOY_RUN_ID_PREFIX}${this.ids.next()}`,
      operationKey: operation.key,
      revision: this.revision.current(),
      actor: command.actor,
      at: this.clock.now(),
      report,
    });
    await this.uow.run(async () => {
      await this.runs.save(run);
      await seal(run.id);
    });
    return run.id;
  }
}
