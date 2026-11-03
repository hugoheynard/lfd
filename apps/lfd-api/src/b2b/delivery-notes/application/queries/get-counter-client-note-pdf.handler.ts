import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import {
  CounterDeliveryNoteNotYetError,
  CounterDeliveryNoteOutOfReachError,
} from "../../domain/errors/delivery-note-errors.js";
import { counterNoteReach } from "../../domain/services/counter-note-reach.js";
import {
  deliveryNotePdfFileName,
  renderClientNotePdf,
} from "../../domain/services/delivery-note-pdf.js";
import { clientNoteOf } from "../../domain/services/delivery-note-sheet.js";
import { DeliveryNoteDocuments } from "../services/delivery-note-documents.js";
import {
  type CounterClientNotePdf,
  GetCounterClientNotePdfQuery,
} from "./get-counter-client-note-pdf.query.js";

/**
 * Le BL chiffré **pour le comptoir** (plan du jour J, lot L6) — le même
 * document que celui du client, derrière un mur plus étroit : le BL remis
 * d'un retrait ({@link counterNoteReach}). La remise se lit au canal du
 * retrait : attestée sans BL encore écrit, c'est « pas encore », pas un refus.
 *
 * @throws {OrderNotFoundError} la commande n'existe pas.
 * @throws {CounterDeliveryNoteOutOfReachError} ce n'est pas un retrait remis.
 * @throws {CounterDeliveryNoteNotYetError} remise attestée, BL pas encore écrit.
 */
@QueryHandler(GetCounterClientNotePdfQuery)
export class GetCounterClientNotePdfHandler implements IQueryHandler<
  GetCounterClientNotePdfQuery,
  CounterClientNotePdf
> {
  constructor(
    private readonly documents: DeliveryNoteDocuments,
    private readonly handovers: OrderHandoverHistoryReader,
  ) {}

  async execute(query: GetCounterClientNotePdfQuery): Promise<CounterClientNotePdf> {
    const { owned, head, billing } = await this.documents.order(query.orderId);
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
    const parts = await this.documents.partsOf([state.id]);
    const note = clientNoteOf(state, head, billing, parts.get(state.id));
    // Le BL tendu au comptoir porte la zone de réception (Hugo, 2026-11-03).
    const bytes = await renderClientNotePdf(note, await this.documents.art(), { receipt: true });
    return { number: state.number, bytes, fileName: deliveryNotePdfFileName(note) };
  }
}
