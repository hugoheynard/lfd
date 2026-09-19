import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeRepository } from "../domain/order-late-fee.repository.js";
import { ReadOrderLateFeeQuery } from "./read-order-late-fee.query.js";

/** Le réglage courant de la surtaxe, ou `null` quand aucune n'est posée. */
@QueryHandler(ReadOrderLateFeeQuery)
export class ReadOrderLateFeeHandler implements IQueryHandler<
  ReadOrderLateFeeQuery,
  LateFeeSetting | null
> {
  constructor(private readonly fees: OrderLateFeeRepository) {}

  async execute(): Promise<LateFeeSetting | null> {
    return this.fees.read();
  }
}
