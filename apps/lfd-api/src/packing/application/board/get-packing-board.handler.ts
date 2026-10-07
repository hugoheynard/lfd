import { BinDesk } from "../../channels/delivery/index.js";
import type { ProductionPackingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  PlannedDestinationsReader,
  QualityHeldOrdersReader,
} from "../../../production/channels/packing/index.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PackingBoardReader } from "../../domain/ports/packing-board.reader.js";
import { packingBoardOf } from "../../domain/services/packing-board.js";
import { GetPackingBoardQuery } from "./get-packing-board.query.js";

/**
 * **Le poste de colisage, servi par le colisage** (plan
 * `colisage/colisage.md`, §17, K3a) — `GET admin/packing/:date/board`.
 *
 * Le contrat est `ProductionPackingView`, celui du poste du fournil retiré en
 * K3c : l'écran a changé d'adresse, pas de forme. Le calcul est `packingBoardOf` ; ici,
 * quatre lectures :
 *
 * - les tables du colisage (`PackingBoardReader`) ;
 * - la retenue au contrôle, que le fournil publie (`QualityHeldOrdersReader`) ;
 * - la destination figée au plan, idem (`PlannedDestinationsReader`) ;
 * - les noms des auteurs, par l'annuaire du staff ;
 * - le froid des livraisons, par le guichet des bacs que la livraison tient
 *   (2026-10-07).
 *
 * Le fournil n'est plus lu pour le rangement : il ne le tient plus.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@QueryHandler(GetPackingBoardQuery)
export class GetPackingBoardHandler implements IQueryHandler<
  GetPackingBoardQuery,
  ProductionPackingView
> {
  constructor(
    private readonly board: PackingBoardReader,
    private readonly held: QualityHeldOrdersReader,
    private readonly destinations: PlannedDestinationsReader,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly desk: BinDesk,
  ) {}

  async execute(query: GetPackingBoardQuery): Promise<ProductionPackingView> {
    const day = await this.board.dayOf(query.serviceDay);
    const orderIds = day.orders.map((order) => order.orderId);
    const [heldOrders, destinations, authors, cold] = await Promise.all([
      this.held.heldOrders(query.serviceDay, orderIds),
      orderIds.length === 0
        ? new Map<string, string>()
        : this.destinations.destinationsOf(query.serviceDay),
      this.staffAuthors.identify(day.orders.map((order) => order.packed?.by ?? null)),
      // Le froid ne se lit que pour les livraisons : un retrait n'a pas de bac.
      this.desk.coldPacking(
        day.orders.filter((order) => order.fulfillmentMethod === "delivery").map((o) => o.orderId),
      ),
    ]);
    return packingBoardOf({
      date: query.serviceDay,
      day,
      now: this.clock.now(),
      // Une commande de la liste est au plan du fournil par construction (la
      // liste est tirée du plan, que rien n'ampute). Vide plutôt qu'un 500 sur
      // le poste si ce n'était plus vrai — jamais une valeur inventée.
      destinationOf: (orderId) => destinations.get(orderId) ?? "",
      authorName: (reference) => authors.nameOf(reference),
      heldOrders,
      cold,
    });
  }
}
