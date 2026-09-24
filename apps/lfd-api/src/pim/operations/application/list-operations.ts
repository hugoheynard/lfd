import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OperationView } from "@lfd/pim-contracts";

import { Clock } from "../../../platform/time/clock.js";
import { OperationReader } from "../domain/ports/operation.reader.js";
import { toOperationView } from "./operation-support.js";

export class ListOperationsQuery {}

/**
 * Toutes les opérations, archivées comprises, l'annonce la plus récente
 * d'abord — pour l'écran de préparation. L'état de chacune est calculé à
 * l'horloge du serveur, une fois pour toute la liste. Lecture pure.
 */
@QueryHandler(ListOperationsQuery)
export class ListOperationsHandler implements IQueryHandler<
  ListOperationsQuery,
  readonly OperationView[]
> {
  constructor(
    private readonly operations: OperationReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly OperationView[]> {
    const now = this.clock.now();
    const snapshots = await this.operations.list();
    return snapshots.map((snapshot) => toOperationView(snapshot, now));
  }
}
