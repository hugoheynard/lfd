import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { HandoverProofReader } from "../../../../handover/channels/commerce/index.js";
import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { OrderHandoverProofImageNotFoundError } from "../../domain/errors/order-handover-proof-errors.js";
import { GetOrderHandoverProofImageQuery } from "./get-order-handover-proof-image.query.js";

/**
 * Sert la photo ou la signature d'une remise à la porte. Le retrait retrouve
 * lui-même la pièce de CETTE commande : une commande sans pièce rend 404,
 * jamais l'image d'une autre.
 *
 * @throws {OrderHandoverProofImageNotFoundError}
 */
@QueryHandler(GetOrderHandoverProofImageQuery)
export class GetOrderHandoverProofImageHandler implements IQueryHandler<
  GetOrderHandoverProofImageQuery,
  StoredDocument
> {
  constructor(private readonly proofs: HandoverProofReader) {}

  async execute(query: GetOrderHandoverProofImageQuery): Promise<StoredDocument> {
    const image = await this.proofs.image(query.orderId, query.piece);
    if (image === null) {
      throw new OrderHandoverProofImageNotFoundError(query.piece);
    }
    return image;
  }
}
