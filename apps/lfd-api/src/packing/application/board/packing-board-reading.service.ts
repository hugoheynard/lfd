import { Injectable } from "@nestjs/common";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import {
  PlannedDestinationsReader,
  QualityHeldOrdersReader,
} from "../../../production/channels/packing/index.js";
import {
  DeliveryNoteReprintsReader,
  ShortfallAftermathReader,
} from "../../channels/commerce/index.js";
import { BinDesk, OrderDeparturesReader } from "../../channels/delivery/index.js";
import { PackingBoardReader } from "../../domain/ports/packing-board.reader.js";
import {
  type PackingBoardContent,
  packingBoardContentOf,
} from "../../domain/services/packing-board.js";
import { localDepartures } from "./local-departures.js";

/**
 * **La lecture du poste de colisage d'une journée, sans horloge** — ce que
 * l'objet des journées garde (`GetPackingBoardHandler`). Le calcul est
 * `packingBoardContentOf` ; ici, les lectures :
 *
 * - les tables du colisage (`PackingBoardReader`) — journal `production`,
 *   qui additionne le fournil et le colisage ;
 * - la retenue au contrôle et la destination figée au plan, que le fournil
 *   publie par son canal — journal `production` ;
 * - le froid des livraisons (le guichet des bacs) et le départ de la tournée
 *   ou du transfert de chaque commande, que la livraison sert par ses ports —
 *   journal `delivery` ;
 * - le BL à réimprimer et le départ incomplet décidé, au commerce par le
 *   canal (`delivery_note`, `order_shortfall`) — journal `orders` ;
 * - les noms des auteurs, par l'annuaire du staff — **hors journal**.
 *
 * Aucune de ces lectures n'a de repli : une panne remonte en erreur, rien
 * n'est servi dégradé (vérifié le 2026-11-13 dans les adaptateurs des sept
 * ports). Le nom du client est l'instantané rangé au colisage
 * (`customerLabel`), pas une lecture de la société.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@Injectable()
export class PackingBoardReading {
  constructor(
    private readonly board: PackingBoardReader,
    private readonly held: QualityHeldOrdersReader,
    private readonly destinations: PlannedDestinationsReader,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly desk: BinDesk,
    private readonly departures: OrderDeparturesReader,
    private readonly reprints: DeliveryNoteReprintsReader,
    private readonly aftermath: ShortfallAftermathReader,
  ) {}

  async contentOf(serviceDay: string): Promise<PackingBoardContent> {
    const day = await this.board.dayOf(serviceDay);
    const orderIds = day.orders.map((order) => order.orderId);
    const [heldOrders, destinations, cold, departures, reprintNeeded, aftermath] =
      await Promise.all([
        this.held.heldOrders(serviceDay, orderIds),
        orderIds.length === 0
          ? new Map<string, string>()
          : this.destinations.destinationsOf(serviceDay),
        // Le froid ne se lit que pour les livraisons : un retrait n'a pas de bac.
        this.desk.coldPacking(
          day.orders
            .filter((order) => order.fulfillmentMethod === "delivery")
            .map((o) => o.orderId),
        ),
        this.departures.departuresOf(orderIds),
        this.reprints.reprintNeededAmong(orderIds),
        this.aftermath.among(orderIds),
      ]);
    // Les auteurs APRÈS le commerce : qui a fermé un bac, et qui a décidé un
    // départ incomplet — une seule lecture de l'annuaire pour les deux.
    const authors = await this.staffAuthors.identify([
      ...day.orders.map((order) => order.packed?.by ?? null),
      ...aftermath.map((decided) => decided.decision?.decidedBy ?? null),
    ]);
    return packingBoardContentOf({
      date: serviceDay,
      day,
      // Une commande de la liste est au plan du fournil par construction (la
      // liste est tirée du plan, que rien n'ampute). Vide plutôt qu'un 500 sur
      // le poste si ce n'était plus vrai — jamais une valeur inventée.
      destinationOf: (orderId) => destinations.get(orderId) ?? "",
      authorName: (reference) => authors.nameOf(reference),
      heldOrders,
      cold,
      departures: localDepartures(departures),
      reprintNeeded,
      aftermath,
    });
  }
}
