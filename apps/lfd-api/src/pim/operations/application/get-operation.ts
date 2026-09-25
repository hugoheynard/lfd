import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OperationView } from "@lfd/pim-contracts";

import { Clock } from "../../../platform/time/clock.js";
import { OperationNotFoundError } from "../domain/errors/operation-errors.js";
import { OperationReader } from "../domain/ports/operation.reader.js";
import { toOperationView } from "./operation-support.js";

export class GetOperationQuery {
  constructor(readonly key: string) {}
}

/** Une opération par sa clé, archivée comprise, son état calculé maintenant. Lecture pure. */
@QueryHandler(GetOperationQuery)
export class GetOperationHandler implements IQueryHandler<GetOperationQuery, OperationView> {
  constructor(
    private readonly operations: OperationReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetOperationQuery): Promise<OperationView> {
    const snapshot = await this.operations.find(query.key);
    if (snapshot === null) {
      throw new OperationNotFoundError(query.key);
    }
    return toOperationView(snapshot, this.clock.now());
  }
}
