import { Module } from "@nestjs/common";

import { ApplyPostDeployOperationHandler } from "./application/apply-post-deploy-operation.handler.js";
import { InterruptOrphanRuns } from "./application/interrupt-orphan-runs.js";
import { ListPostDeployOperationsHandler } from "./application/list-post-deploy-operations.handler.js";
import { PostDeployCatalogue } from "./application/post-deploy-catalogue.js";
import { PostDeployExecution } from "./application/post-deploy-execution.js";
import { ReadPostDeployRunHandler } from "./application/read-post-deploy-run.handler.js";
import { SimulatePostDeployOperationHandler } from "./application/simulate-post-deploy-operation.handler.js";
import { DeployedRevision } from "./domain/deployed-revision.js";
import { PostDeployRunReader } from "./domain/post-deploy-run.reader.js";
import { PostDeployRunRepository } from "./domain/post-deploy-run.repository.js";
import { AdminPostDeployController } from "./http/admin-post-deploy.controller.js";
import { AppConfigDeployedRevision } from "./infrastructure/app-config-deployed-revision.js";
import { InterruptOrphanRunsOnBoot } from "./infrastructure/interrupt-orphan-runs.on-boot.js";
import { PrismaPostDeployRunReader } from "./infrastructure/prisma-post-deploy-run.reader.js";
import { PrismaPostDeployRunRepository } from "./infrastructure/prisma-post-deploy-run.repository.js";

/**
 * **Après déploiement**, dans `ops`. La liste des opérations
 * (`POST_DEPLOY_OPERATIONS`) n'est PAS fournie ici : `ops` n'importe aucun
 * bloc métier, c'est `appBootstrap/post-deploy-operations.module.ts` qui la
 * relie, en global.
 */
@Module({
  controllers: [AdminPostDeployController],
  providers: [
    PostDeployCatalogue,
    PostDeployExecution,
    InterruptOrphanRuns,
    InterruptOrphanRunsOnBoot,
    SimulatePostDeployOperationHandler,
    ApplyPostDeployOperationHandler,
    ListPostDeployOperationsHandler,
    ReadPostDeployRunHandler,
    { provide: PostDeployRunRepository, useClass: PrismaPostDeployRunRepository },
    { provide: PostDeployRunReader, useClass: PrismaPostDeployRunReader },
    { provide: DeployedRevision, useClass: AppConfigDeployedRevision },
  ],
})
export class PostDeployModule {}
