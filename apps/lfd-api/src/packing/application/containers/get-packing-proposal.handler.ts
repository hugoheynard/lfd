import type { DeliveryPackingProposalView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BinDesk } from "../../channels/delivery/index.js";
import { GetPackingProposalQuery } from "./get-packing-proposal.query.js";

/**
 * **« Proposer »** (K2b, décision 4 de Hugo : sur un clic, pas d'office) — la
 * proposition de la livraison, qui tient les types de bacs et leurs
 * contenances, lue par `BinDesk`. Une LECTURE : rien n'est écrit, et ce n'est
 * pas la proposition qui fait foi mais les contenants créés ensuite.
 *
 * @throws {BinsNotDeclarableError} commande inconnue, annulée ou en retrait.
 */
@QueryHandler(GetPackingProposalQuery)
export class GetPackingProposalHandler implements IQueryHandler<
  GetPackingProposalQuery,
  DeliveryPackingProposalView
> {
  constructor(private readonly desk: BinDesk) {}

  async execute(query: GetPackingProposalQuery): Promise<DeliveryPackingProposalView> {
    return this.desk.propose(query.orderId);
  }
}
