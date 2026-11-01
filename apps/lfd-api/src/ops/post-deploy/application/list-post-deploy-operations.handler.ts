import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PostDeployOperationView, PostDeployOverview } from "@lfd/ops-contract";

import type {
  OperationReport,
  PostDeployOperation,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import { DeployedRevision } from "../domain/deployed-revision.js";
import type { PostDeployRunSnapshot } from "../domain/post-deploy-run.js";
import { PostDeployRunReader } from "../domain/post-deploy-run.reader.js";
import { ListPostDeployOperationsQuery } from "./list-post-deploy-operations.query.js";
import { PostDeployCatalogue } from "./post-deploy-catalogue.js";
import { reportView, runView } from "./post-deploy-views.js";

/**
 * La liste, **simulée à l'instant** : une opération est à faire tant que sa
 * simulation trouve une décision écrivable (§ 7.2) — elle disparaît
 * d'elle-même, sans liste tenue à la main. Rien n'est tracé ici : une lecture
 * n'écrit pas ; seul le geste « Simuler » laisse un passage.
 */
@QueryHandler(ListPostDeployOperationsQuery)
export class ListPostDeployOperationsHandler implements IQueryHandler<
  ListPostDeployOperationsQuery,
  PostDeployOverview
> {
  constructor(
    private readonly catalogue: PostDeployCatalogue,
    private readonly reader: PostDeployRunReader,
    private readonly revision: DeployedRevision,
  ) {}

  async execute(): Promise<PostDeployOverview> {
    const operations = this.catalogue.all();
    const latest = await this.reader.latestOf(operations.map((operation) => operation.key));
    const reports = new Map<string, OperationReport>();
    for (const operation of operations) {
      reports.set(operation.key, await operation.simulate());
    }
    const views = operations.map((operation) =>
      operationView(operation, reports, latest.get(operation.key) ?? null),
    );
    return {
      revision: this.revision.current(),
      anyToDo: views.some((view) => view.toDo),
      operations: views,
    };
  }
}

function operationView(
  operation: PostDeployOperation,
  reports: ReadonlyMap<string, OperationReport>,
  lastRun: PostDeployRunSnapshot | null,
): PostDeployOperationView {
  const current = reports.get(operation.key);
  const writable = current?.writable ?? 0;
  return {
    key: operation.key,
    title: operation.title,
    why: operation.why,
    limit: operation.limit,
    after: [...operation.after],
    toDo: writable > 0,
    blockedBy: operation.after.filter((key) => (reports.get(key)?.writable ?? 0) > 0),
    current: current === undefined ? null : reportView(current),
    lastRun: lastRun === null ? null : runView(lastRun),
  };
}
