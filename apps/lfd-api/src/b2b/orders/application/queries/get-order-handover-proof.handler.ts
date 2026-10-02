import type { OrderHandoverProofResponse } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { HandoverProofReader } from "../../../../handover/channels/commerce/index.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { GetOrderHandoverProofQuery } from "./get-order-handover-proof.query.js";
import { toOrderHandoverProofView } from "./order-handover-proof-view.js";

/**
 * **La carte « Preuve de livraison »** d'une commande.
 *
 * Les pièces appartiennent au retrait : on les lit par le port qu'il publie,
 * jamais dans sa table. `proof: null` dit « pas remise à la porte » — une
 * commande retirée au comptoir n'a rien à montrer ici.
 */
@QueryHandler(GetOrderHandoverProofQuery)
export class GetOrderHandoverProofHandler implements IQueryHandler<
  GetOrderHandoverProofQuery,
  OrderHandoverProofResponse
> {
  constructor(
    private readonly proofs: HandoverProofReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: GetOrderHandoverProofQuery): Promise<OrderHandoverProofResponse> {
    const exhibit = await this.proofs.ofOrder(query.orderId);
    if (exhibit === null) {
      return { proof: null };
    }
    const authors = await this.staffAuthors.identify([exhibit.handedOverBy]);
    return { proof: toOrderHandoverProofView(exhibit, authors.nameOf(exhibit.handedOverBy)) };
  }
}
