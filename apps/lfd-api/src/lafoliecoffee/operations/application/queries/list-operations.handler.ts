import type { CommerceOperationView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import { OperationReader } from "../../domain/ports/operation.reader.js";
import { OperationSaleReader } from "../../domain/ports/operation-sale.reader.js";
import { ListOperationsQuery } from "./list-operations.query.js";
import { operationViews } from "./operation-view.js";

/**
 * **Liste les opérations du commerce**, l'annonce la plus récente d'abord —
 * avec, pour chacune, ce que verra le client (`shopDisplay`) et le texte
 * alternatif de son image, lu à la médiathèque (lot 3).
 */
@QueryHandler(ListOperationsQuery)
export class ListOperationsHandler implements IQueryHandler<
  ListOperationsQuery,
  readonly CommerceOperationView[]
> {
  constructor(
    private readonly operations: OperationReader,
    private readonly library: OperationImageLibrary,
    private readonly sale: OperationSaleReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly CommerceOperationView[]> {
    return operationViews(await this.operations.list(), {
      library: this.library,
      sale: this.sale,
      now: this.clock.now(),
    });
  }
}
