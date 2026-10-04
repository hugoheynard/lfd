import { Injectable } from "@nestjs/common";

import { PackingStationReader, type StationDay } from "../../channels/packing/packing-station.js";
import { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { overlayStation, stationAvailable } from "../../domain/services/packing-overlay.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Une journée telle que le poste la voit, et ce qui reste à mettre au bac par article. */
export interface PackedDay {
  readonly day: ProductionDay;
  readonly available: (sku: string) => number;
  /**
   * Ce que le colisage tient de la journée — ses contenants compris (K2b) ;
   * `null` sur une journée `legacy`.
   */
  readonly station: StationDay | null;
}

/**
 * **La journée, bacs compris — où qu'ils soient tenus** (plan
 * `colisage/plan-domaine-colisage.md`, K2, §13 B1).
 *
 * Sur une journée `legacy`, la journée chargée dit tout. Sur une journée
 * `packing`, les bacs, leurs lignes et leurs containers sont au colisage : ils
 * sont posés sur le plan du fournil (`overlayStation`). Le choix suit
 * `packing_owner`, jamais une table de l'ombre.
 *
 * 🔴 **Une LECTURE.** La journée rendue ne s'écrit jamais : `save` réécrirait
 * dans les colonnes du fournil des bacs qu'il ne tient plus. Ses lecteurs — le
 * poste, la supervision, le contrôle qualité (« la commande est-elle
 * colisée ? ») — ne font que la lire ; un handler qui écrit charge la journée
 * par le dépôt.
 */
@Injectable()
export class PackedDayReading {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly station: PackingStationReader,
  ) {}

  async load(day: ServiceDay): Promise<PackedDay> {
    const current = await this.days.load(day);
    if (current.packingOwner !== "packing") {
      return { day: current, available: (sku) => current.availableOf(sku), station: null };
    }
    const held = await this.station.dayOf(day.value);
    return {
      day: ProductionDay.fromSnapshot({
        ...current.toSnapshot(),
        orders: overlayStation(current.orders, held),
      }),
      available: stationAvailable(held),
      station: held,
    };
  }
}
