import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PostDeployAlreadyRunningError,
  PostDeployRunChangedError,
} from "../domain/post-deploy-errors.js";
import { PostDeployRun } from "../domain/post-deploy-run.js";
import { PostDeployRunRepository } from "../domain/post-deploy-run.repository.js";
import { toColumns, toSnapshot } from "./post-deploy-run.rows.js";

/**
 * Les passages, dans `ops.post_deploy_runs`. Seul `ops` l'écrit et la lit.
 *
 * L'écriture d'un passage existant est conditionnée sur l'état lu : deux clics
 * sur la même simulation ne lancent qu'une application. L'index unique
 * partiel `post_deploy_runs_one_running_key` refuse la seconde application
 * en cours d'une même opération (§ 7.4).
 */
@Injectable()
export class PrismaPostDeployRunRepository extends PostDeployRunRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<PostDeployRun | null> {
    const row = await this.prisma.postDeployRun.findUnique({ where: { id } });
    return row === null ? null : PostDeployRun.rehydrate(toSnapshot(row));
  }

  async latestSimulationBy(operationKey: string, actor: string): Promise<PostDeployRun | null> {
    const row = await this.prisma.postDeployRun.findFirst({
      where: { operationKey, simulatedBy: actor },
      orderBy: [{ simulatedAt: "desc" }, { id: "desc" }],
    });
    return row === null ? null : PostDeployRun.rehydrate(toSnapshot(row));
  }

  async running(): Promise<readonly PostDeployRun[]> {
    const rows = await this.prisma.postDeployRun.findMany({
      where: { state: "running" },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => PostDeployRun.rehydrate(toSnapshot(row)));
  }

  async save(run: PostDeployRun): Promise<void> {
    const snapshot = run.snapshot();
    const columns = toColumns(snapshot);
    try {
      if (run.persistedState === null) {
        await this.prisma.postDeployRun.create({ data: { id: snapshot.id, ...columns } });
        return;
      }
      const written = await this.prisma.postDeployRun.updateMany({
        where: { id: snapshot.id, state: run.persistedState },
        data: columns,
      });
      if (written.count !== 1) {
        throw new PostDeployRunChangedError(snapshot.id);
      }
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new PostDeployAlreadyRunningError(snapshot.operationKey);
      }
      throw error;
    }
  }
}
