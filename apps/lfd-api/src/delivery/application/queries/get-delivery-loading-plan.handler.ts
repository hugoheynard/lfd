import type { DeliveryLoadingPlanView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { LoadingPlanReader } from "../../domain/ports/loading-plan.reader.js";
import { planLoading } from "../../domain/services/loading-plan.js";
import { CargoSpace } from "../../domain/value-objects/cargo-space.js";
import { binContextOf } from "../bin-context.js";
import { loadingPlanView, planStopsOf } from "../delivery-loading-plan-view.js";
import { GetDeliveryLoadingPlanQuery } from "./get-delivery-loading-plan.query.js";

/**
 * **Le plan de chargement d'une tournée** (lot 4 bis, L4b-C7, v2-5) : l'ordre
 * de chargement, les piles, le volume sec / froid face au véhicule, et les
 * alertes. Une lecture ; le plan SUGGÈRE l'ordre de scan, il ne l'impose pas.
 *
 * Une tournée n'existe que composée : sans arrêt ni bac, le plan est vide.
 *
 * @throws {DeliveryRoundNotFoundError}
 */
@QueryHandler(GetDeliveryLoadingPlanQuery)
export class GetDeliveryLoadingPlanHandler implements IQueryHandler<
  GetDeliveryLoadingPlanQuery,
  DeliveryLoadingPlanView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly plans: LoadingPlanReader,
  ) {}

  async execute(query: GetDeliveryLoadingPlanQuery): Promise<DeliveryLoadingPlanView> {
    const [round, load] = await Promise.all([
      this.loading.round(query.roundId),
      this.plans.vehicleLoadOf(query.roundId),
    ]);
    if (round === null || load === null) {
      throw new DeliveryRoundNotFoundError(query.roundId);
    }
    const bins = round.stops.flatMap((stop) => stop.bins);
    const [context, binTypes] = await Promise.all([
      binContextOf(
        this.loading,
        this.orders,
        bins,
        round.stops.map((stop) => stop.orderId),
      ),
      this.plans.binTypes([...new Set(bins.map((bin) => bin.binType.id))]),
    ]);
    const plan = planLoading(planStopsOf(round, context, binTypes), {
      name: round.vehicleName,
      // Le volume se dérive par le value object : une seule formule.
      cargoLiters: load.cargo === null ? null : CargoSpace.of(load.cargo).volumeLiters,
      refrigeratedLiters: load.refrigeratedLiters,
    });
    return loadingPlanView(round, plan);
  }
}
