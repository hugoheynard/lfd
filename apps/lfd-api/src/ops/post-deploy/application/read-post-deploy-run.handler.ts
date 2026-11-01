import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PostDeployRunView } from "@lfd/ops-contract";

import { PostDeployRunNotFoundError } from "../domain/post-deploy-errors.js";
import { PostDeployRunReader } from "../domain/post-deploy-run.reader.js";
import { runView } from "./post-deploy-views.js";
import { ReadPostDeployRunQuery } from "./read-post-deploy-run.query.js";

/** L'état d'un passage, ou 404. */
@QueryHandler(ReadPostDeployRunQuery)
export class ReadPostDeployRunHandler implements IQueryHandler<
  ReadPostDeployRunQuery,
  PostDeployRunView
> {
  constructor(private readonly reader: PostDeployRunReader) {}

  async execute(query: ReadPostDeployRunQuery): Promise<PostDeployRunView> {
    const run = await this.reader.byId(query.runId);
    if (run === null) {
      throw new PostDeployRunNotFoundError(query.runId);
    }
    return runView(run);
  }
}
