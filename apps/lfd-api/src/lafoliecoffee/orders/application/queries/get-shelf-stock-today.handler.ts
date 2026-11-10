import type { ShelfStockTodayView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CatalogViewers } from "../../../catalog/application/catalog-viewers.service.js";
import { anonymousViewer, type CatalogViewer } from "../../../catalog/domain/catalog-viewer.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { sameDayDoorOf, type SameDayDoor } from "../../../order-cutoffs/domain/same-day-doors.js";
import { DayShelfStock } from "../../../resupply/application/day-shelf-stock.js";
import { shelfLeftFor, type ShelfServedArticle } from "../../domain/services/shelf-left-today.js";
import { OrderPlanGate } from "../services/order-plan-gate.service.js";
import { ShelfCircuit } from "../services/shelf-circuit.service.js";
import { GetShelfStockTodayQuery, type ShelfStockCaller } from "./get-shelf-stock-today.query.js";

/**
 * **Le reste d'aujourd'hui d'un point, pour la boutique** (plan du jour J,
 * lot L7b) — les mêmes gardes que la passation sur stock, dans le même
 * ordre, pour que la vignette ne promette pas ce que le panier refuserait :
 *
 * 1. le plan d'aujourd'hui est ARRÊTÉ (`ShelfCircuit.decide`) — sinon
 *    aujourd'hui se fabrique encore, et il n'y a pas de vitrine à vendre ;
 * 2. le circuit est ouvert à la porte de l'appelant et le point a encore un
 *    créneau pour elle (`ShelfCircuit.refusalFor`) ;
 * 3. le reste (`DayShelfStock`), réduit aux articles que le catalogue sert à
 *    CET appelant (`servedToViewer` : sur mesure non attribué et réservés à
 *    d'autres absents) et à leur unité de vente.
 *
 * Chaque refus rend une liste VIDE plutôt qu'une erreur : la boutique lit
 * la vitrine, elle n'y passe pas commande. La porte vient de la société,
 * comme à la passation (`sameDayDoorOf`) ; le catalogue, de `CatalogViewers`.
 * Sans verrou : il ouvre un écran, il n'autorise rien.
 */
@QueryHandler(GetShelfStockTodayQuery)
export class GetShelfStockTodayHandler implements IQueryHandler<
  GetShelfStockTodayQuery,
  ShelfStockTodayView
> {
  constructor(
    private readonly plans: OrderPlanGate,
    private readonly circuit: ShelfCircuit,
    private readonly stock: DayShelfStock,
    private readonly catalog: ProductCatalogReader,
    private readonly viewers: CatalogViewers,
  ) {}

  async execute(query: GetShelfStockTodayQuery): Promise<ShelfStockTodayView> {
    const today = this.plans.today();
    if (!(await this.plans.isClosed(today))) {
      return [];
    }
    const refusal = await this.circuit.refusalFor(doorOf(query.caller), query.pickupAddressId);
    if (refusal !== null) {
      return [];
    }
    const stock = await this.stock.at(query.pickupAddressId, today);
    const skus = stock.filter((line) => line.estimatedStock > 0).map((line) => line.sku);
    if (skus.length === 0) {
      return [];
    }
    return shelfLeftFor(stock, await this.servedOf(skus, query.caller));
  }

  /** Les articles commandables par cet appelant — un article verrouillé n'en est pas. */
  private async servedOf(
    skus: readonly string[],
    caller: ShelfStockCaller,
  ): Promise<ReadonlyMap<string, ShelfServedArticle>> {
    const items = await this.catalog.resolveMany(skus, await this.viewerOf(caller));
    return new Map([...items].filter(([, item]) => item.reservation !== "other"));
  }

  private viewerOf(caller: ShelfStockCaller): Promise<CatalogViewer> {
    return caller.kind === "anonymous"
      ? Promise.resolve(anonymousViewer(caller.audience))
      : this.viewers.forCompany(caller.companyId);
  }
}

/** La porte du circuit : l'audience annoncée par l'anonyme, la société du reconnu. */
function doorOf(caller: ShelfStockCaller): SameDayDoor {
  if (caller.kind === "anonymous") {
    return caller.audience === "pro" ? "pro_online" : "public_online";
  }
  return sameDayDoorOf(caller.companyId, false);
}
