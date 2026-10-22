import type { DeliveryCompositionGapsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "../../domain/ports/composition-prerequisites.readers.js";
import { compositionGapsOf } from "../../domain/services/composition-prerequisites.js";
import { GetCompositionGapsQuery } from "./get-composition-gaps.query.js";

/**
 * **Le manque de flotte, rendu visible** (2026-10-22). La composition
 * automatique échouait en silence — dans les journaux seulement — quand aucun
 * véhicule en service n'avait ses cotes ou qu'aucun type de bac n'était en
 * service. Cette lecture rend ces manques à l'écran des tournées et à la
 * Supervision, avant que « Proposer » ne les refuse.
 *
 * Lecture pure, sans jour : la règle (CA-D3) porte sur la flotte et le
 * catalogue entiers, lus maintenant.
 */
@QueryHandler(GetCompositionGapsQuery)
export class GetCompositionGapsHandler implements IQueryHandler<
  GetCompositionGapsQuery,
  DeliveryCompositionGapsView
> {
  constructor(
    private readonly vehicles: MeasuredVehiclesReader,
    private readonly binTypes: ActiveBinTypesReader,
  ) {}

  async execute(): Promise<DeliveryCompositionGapsView> {
    const [measuredVehicleIds, activeBinTypeIds] = await Promise.all([
      this.vehicles.measuredIds(),
      this.binTypes.activeIds(),
    ]);
    return { gaps: compositionGapsOf({ measuredVehicleIds, activeBinTypeIds }) };
  }
}
