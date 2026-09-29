import type {
  DeliveryRunSheetAddressBookView,
  DeliveryRunSheetStopView,
  DeliveryRunSheetView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  DeliveryRunSheetReader,
  type DeliveryRunSheetAddressBook,
  type DeliveryRunSheetEntry,
} from "../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../domain/ports/handover-attestations.reader.js";
import { queueStateOf } from "../../domain/services/queue-state.js";
import { AtelierSheetsReader } from "../../../production/channels/handover/index.js";
import { GetDeliveryRunSheetQuery } from "./get-delivery-run-sheet.query.js";

/**
 * **La feuille de route du jour** — ce que le commerce envoie en livraison,
 * croisé avec ce que le retrait a déjà attesté et ce que la production n'a pas
 * mis dans son plan (`plan-preparation-de-tournee.md`, lot 1).
 *
 * La même rencontre que `GetHandoverQueueHandler`, et pour la même raison dans
 * un handler : chaque lecture reste chez son propriétaire. L'état se calcule
 * par `queueStateOf`, la règle de la file — une livraison déjà retirée ou
 * annulée se dit ici comme au comptoir.
 *
 * ## Trois questions, jamais N + 1
 *
 * Les livraisons du jour, puis — en parallèle, pour le lot entier — les
 * attestations et les commandes sans feuille d'atelier.
 */
@QueryHandler(GetDeliveryRunSheetQuery)
export class GetDeliveryRunSheetHandler implements IQueryHandler<
  GetDeliveryRunSheetQuery,
  DeliveryRunSheetView
> {
  constructor(
    private readonly deliveries: DeliveryRunSheetReader,
    private readonly attestations: HandoverAttestationsReader,
    private readonly sheets: AtelierSheetsReader,
  ) {}

  async execute(query: GetDeliveryRunSheetQuery): Promise<DeliveryRunSheetView> {
    const entries = await this.deliveries.deliveriesOn(query.day);
    const orderIds = entries.map((entry) => entry.orderId);
    const [attested, withoutSheet] = await Promise.all([
      this.attestations.forOrders(orderIds),
      this.sheets.withoutSheet(query.day, orderIds),
    ]);
    return {
      day: query.day,
      stops: entries.map((entry) =>
        toStopView(entry, attested.get(entry.orderId), withoutSheet.has(entry.orderId)),
      ),
    };
  }
}

/** Un arrêt, dans le vocabulaire de l'écran. Aucun montant n'y entre. */
function toStopView(
  entry: DeliveryRunSheetEntry,
  attestation: AttestedHandover | undefined,
  withoutAtelierSheet: boolean,
): DeliveryRunSheetStopView {
  return {
    orderId: entry.orderId,
    reference: entry.reference,
    customerLabel: entry.customerLabel,
    tradeName: entry.tradeName,
    clientele: entry.clientele,
    address: entry.address,
    window: entry.window,
    contact: entry.contact,
    signatureRequired: entry.signatureRequired,
    orderNote: entry.orderNote,
    addressBook: entry.addressBook === null ? null : toAddressBookView(entry.addressBook),
    totalUnits: entry.totalUnits,
    state: queueStateOf(entry, attestation),
    readyAt: entry.readyAt === null ? null : entry.readyAt.toISOString(),
    withoutAtelierSheet,
    placedAt: entry.placedAt.toISOString(),
  };
}

function toAddressBookView(book: DeliveryRunSheetAddressBook): DeliveryRunSheetAddressBookView {
  return {
    companyId: book.companyId,
    addressId: book.addressId,
    note: book.note,
    gps: book.gps,
    ...(book.stopMinutes === null ? {} : { stopMinutes: book.stopMinutes }),
    procedure: book.procedure.map((step) => ({ ...step })),
  };
}
