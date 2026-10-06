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
import {
  RoundPlacementsReader,
  type RoundPlacement,
} from "../../../delivery/channels/handover/index.js";
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
 *
 * ## Les livraisons d'un autre jour, nommées
 *
 * Une commande rapportée replacée dans une tournée d'un autre jour que sa
 * date demandée (`decisions-par-defaut-2026-10-02.md`, § 4) n'est dans la
 * feuille d'aucun jour composé : l'écran la nomme (`alsoOrderIds`), et elle
 * suit, après celles du jour, avec la même procédure sous le même droit.
 *
 * ## La tournée et le rang, chez la livraison
 *
 * Lus en même temps que les attestations, pour le lot entier
 * (`RoundPlacementsReader`, 2026-10-06) : une livraison sans tournée part à
 * `null`, et le compte des tournées est celui du jour demandé.
 *
 * ## La procédure, sous son propre droit
 *
 * Masquée ici, dans la lecture, quand la query le dit (DG-D8) — pas à l'écran.
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
    private readonly rounds: RoundPlacementsReader,
  ) {}

  async execute(query: GetDeliveryRunSheetQuery): Promise<DeliveryRunSheetView> {
    const [ofDay, among] = await Promise.all([
      this.deliveries.deliveriesOn(query.day),
      this.deliveries.deliveriesAmong(query.alsoOrderIds),
    ]);
    const known = new Set(ofDay.map((entry) => entry.orderId));
    const others = among.filter((entry) => !known.has(entry.orderId));
    const entries = [...ofDay, ...others];
    const orderIds = entries.map((entry) => entry.orderId);
    const [attested, withoutSheet, placements] = await Promise.all([
      this.attestations.forOrders(orderIds),
      // Le plan d'atelier est celui du JOUR : une commande d'un autre jour
      // n'y figure pas, et ce n'est pas un manque — elle a été faite le sien.
      this.sheets.withoutSheet(
        query.day,
        ofDay.map((entry) => entry.orderId),
      ),
      this.rounds.placementsOf(query.day, orderIds),
    ]);
    return {
      day: query.day,
      stops: entries.map((entry) =>
        toStopView(
          entry,
          attested.get(entry.orderId),
          withoutSheet.has(entry.orderId),
          query.withProcedures,
          placements.byOrder.get(entry.orderId),
        ),
      ),
      roundCount: placements.roundCount,
    };
  }
}

/** Un arrêt, dans le vocabulaire de l'écran. Aucun montant n'y entre. */
function toStopView(
  entry: DeliveryRunSheetEntry,
  attestation: AttestedHandover | undefined,
  withoutAtelierSheet: boolean,
  withProcedures: boolean,
  placement: RoundPlacement | undefined,
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
    addressBook:
      entry.addressBook === null ? null : toAddressBookView(entry.addressBook, withProcedures),
    totalUnits: entry.totalUnits,
    state: queueStateOf(entry, attestation),
    readyAt: entry.readyAt === null ? null : entry.readyAt.toISOString(),
    withoutAtelierSheet,
    placedAt: entry.placedAt.toISOString(),
    round:
      placement === undefined
        ? null
        : { roundId: placement.roundId, label: placement.label, position: placement.position },
  };
}

/**
 * Les consignes du carnet. Sans `delivery_procedures:read`, la procédure part
 * vide (DG-D8) : le champ reste — un front en ligne le lit comme un tableau —,
 * mais ni titre, ni texte, ni présence de photo ne sortent. Les consignes
 * générales (note, GPS, temps sur place) restent : elles relèvent de la feuille.
 */
function toAddressBookView(
  book: DeliveryRunSheetAddressBook,
  withProcedures: boolean,
): DeliveryRunSheetAddressBookView {
  return {
    companyId: book.companyId,
    addressId: book.addressId,
    note: book.note,
    gps: book.gps,
    ...(book.stopMinutes === null ? {} : { stopMinutes: book.stopMinutes }),
    procedure: withProcedures ? book.procedure.map((step) => ({ ...step })) : [],
  };
}
