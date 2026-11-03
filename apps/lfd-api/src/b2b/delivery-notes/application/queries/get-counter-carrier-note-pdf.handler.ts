import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import {
  CounterDeliveryNoteNotYetError,
  CounterDeliveryNoteOutOfReachError,
} from "../../domain/errors/delivery-note-errors.js";
import { counterNoteReach } from "../../domain/services/counter-note-reach.js";
import {
  deliveryNotePdfFileName,
  renderCarrierNotePdf,
} from "../../domain/services/delivery-note-pdf.js";
import { carrierNoteOf } from "../../domain/services/delivery-note-sheet.js";
import { undeliveredOf } from "../../domain/services/undelivered-lines.js";
import { DeliveryNoteDocuments } from "../services/delivery-note-documents.js";
import {
  type CounterCarrierNotePdf,
  GetCounterCarrierNotePdfQuery,
} from "./get-counter-carrier-note-pdf.query.js";

/**
 * Le BL **de transport** pour le comptoir — celui qu'on tend et fait signer,
 * sans aucun montant, comme en livraison (Hugo, 2026-11-03, qui revient sur
 * le BL chiffré du lot L6 du 2026-11-02 : le chiffré reste dans l'espace
 * client et sur la fiche commande). Le mur est étroit : le BL remis d'un
 * retrait ({@link counterNoteReach}). La remise se lit au canal du
 * retrait : attestée sans BL encore écrit, c'est « pas encore », pas un refus.
 *
 * @throws {OrderNotFoundError} la commande n'existe pas.
 * @throws {CounterDeliveryNoteOutOfReachError} ce n'est pas un retrait remis.
 * @throws {CounterDeliveryNoteNotYetError} remise attestée, BL pas encore écrit.
 */
@QueryHandler(GetCounterCarrierNotePdfQuery)
export class GetCounterCarrierNotePdfHandler implements IQueryHandler<
  GetCounterCarrierNotePdfQuery,
  CounterCarrierNotePdf
> {
  constructor(
    private readonly documents: DeliveryNoteDocuments,
    private readonly handovers: OrderHandoverHistoryReader,
  ) {}

  async execute(query: GetCounterCarrierNotePdfQuery): Promise<CounterCarrierNotePdf> {
    const { owned, head } = await this.documents.order(query.orderId);
    const notes = await this.documents.listFor(query.orderId);
    const handovers = await this.handovers.ofOrders([query.orderId]);
    const reach = counterNoteReach({
      fulfillmentMethod: owned.view.fulfillmentMethod,
      handedOver: handovers.has(query.orderId),
      notes,
    });
    if (reach.kind === "not_yet") {
      throw new CounterDeliveryNoteNotYetError(query.orderId);
    }
    if (reach.kind === "out_of_reach") {
      throw new CounterDeliveryNoteOutOfReachError(query.orderId);
    }
    const state = reach.note;
    const note = carrierNoteOf(state, head);
    const undelivered = undeliveredOf(owned.view.lines, notes, state);
    const bytes = await renderCarrierNotePdf(note, await this.documents.art(), undelivered);
    return { number: state.number, bytes, fileName: deliveryNotePdfFileName(note) };
  }
}
