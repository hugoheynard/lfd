import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { OrderAccessReader } from "../../../orders/domain/ports/order-access.reader.js";
import { ensureOrderVisible } from "../../../orders/domain/services/order-access.js";
import type { DeliveryNoteStatus } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteNotFoundError } from "../../domain/errors/delivery-note-errors.js";
import {
  deliveryNotePdfFileName,
  renderClientNotePdf,
} from "../../domain/services/delivery-note-pdf.js";
import { clientNoteOf } from "../../domain/services/delivery-note-sheet.js";
import {
  type DeliveryNotePdf,
  DeliveryNoteDocuments,
} from "../services/delivery-note-documents.js";
import { GetClientNotePdfQuery } from "./get-client-note-pdf.query.js";

/** Le mot qui désigne, dans une route client, « le BL de la remise ». */
const HANDED_OVER: DeliveryNoteStatus = "handed_over";

/**
 * Sert au client le BL **remis** de sa commande, chiffré.
 *
 * Le mur est celui du bon de commande (`ensureOrderVisible`, la même règle) :
 * une commande d'une autre société — ou un BL pas encore remis — rend le même
 * 404, qui ne dit pas qu'un numéro existe. Un BL prévu ou préparé n'est pas
 * encore un fait que le client peut opposer : il n'a rien reçu.
 *
 * ⚠️ Un seul BL remis par commande jusqu'aux reliquats (E6) : le dernier par
 * rang est servi. E6 décidera comment le client choisit entre plusieurs.
 */
@QueryHandler(GetClientNotePdfQuery)
export class GetClientNotePdfHandler implements IQueryHandler<
  GetClientNotePdfQuery,
  DeliveryNotePdf
> {
  constructor(
    private readonly access: OrderAccessReader,
    private readonly documents: DeliveryNoteDocuments,
  ) {}

  async execute(query: GetClientNotePdfQuery): Promise<DeliveryNotePdf> {
    const { owned, head, billing } = await this.documents.order(query.orderId);
    const role =
      owned.companyId === null ? null : await this.access.accessToOrder(query.actorUserId, owned);
    ensureOrderVisible(owned, query.actorUserId, role, query.orderId);

    const handedOver = (await this.documents.listFor(query.orderId)).filter(
      (note) => note.status === HANDED_OVER,
    );
    const state = handedOver.at(-1);
    if (state === undefined) {
      throw new DeliveryNoteNotFoundError(query.orderId, "remis");
    }
    const note = clientNoteOf(state, head, billing);
    const bytes = await renderClientNotePdf(note, await this.documents.art());
    return { bytes, fileName: deliveryNotePdfFileName(note) };
  }
}
