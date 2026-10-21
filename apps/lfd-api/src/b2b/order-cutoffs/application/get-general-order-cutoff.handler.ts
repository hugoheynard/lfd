import type { GeneralOrderCutoffResponse } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StoredOrderCutoffReader } from "../domain/stored-order-cutoff.reader.js";
import { GetGeneralOrderCutoffQuery } from "./get-general-order-cutoff.query.js";

/**
 * Lit **la règle générale** telle qu'elle est rangée — même quand
 * l'interrupteur l'éteint : l'écran montre ce que la réactivation remettra.
 */
@QueryHandler(GetGeneralOrderCutoffQuery)
export class GetGeneralOrderCutoffHandler implements IQueryHandler<
  GetGeneralOrderCutoffQuery,
  GeneralOrderCutoffResponse
> {
  constructor(private readonly stored: StoredOrderCutoffReader) {}

  async execute(): Promise<GeneralOrderCutoffResponse> {
    return { rule: await this.stored.general() };
  }
}
