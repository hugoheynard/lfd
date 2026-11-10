import type { CommerceOperationView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import { OperationNotFoundError } from "../../domain/errors/operation-errors.js";
import { OperationReader } from "../../domain/ports/operation.reader.js";
import { OperationSaleReader } from "../../domain/ports/operation-sale.reader.js";
import { GetOperationQuery } from "./get-operation.query.js";
import { operationViews } from "./operation-view.js";

/** **Une opération du commerce**, telle que l'écran l'ouvre. */
@QueryHandler(GetOperationQuery)
export class GetOperationHandler implements IQueryHandler<
  GetOperationQuery,
  CommerceOperationView
> {
  constructor(
    private readonly operations: OperationReader,
    private readonly library: OperationImageLibrary,
    private readonly sale: OperationSaleReader,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {OperationNotFoundError} aucune opération ne porte cette clé.
   */
  async execute(query: GetOperationQuery): Promise<CommerceOperationView> {
    const operation = await this.operations.find(query.key);
    if (operation === null) {
      throw new OperationNotFoundError(query.key);
    }
    const [view] = await operationViews([operation], {
      library: this.library,
      sale: this.sale,
      now: this.clock.now(),
    });
    if (view === undefined) {
      throw new OperationNotFoundError(query.key);
    }
    return view;
  }
}
