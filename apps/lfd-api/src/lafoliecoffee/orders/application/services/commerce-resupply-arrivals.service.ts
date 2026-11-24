import { Injectable } from "@nestjs/common";

import { ResupplyArrivalSuggestions } from "../../../resupply/domain/resupply-arrival-suggestions.js";
import { SiteDeadlines } from "./site-deadlines.service.js";

/**
 * **Les commandes répondent au réassort : l'heure d'arrivée que chaque point
 * demande** (H-D3 du plan de l'heure du réassort), par la MÊME règle que le
 * transfert (`SiteDeadlines`, `transferDeparture`) : une seule vérité.
 *
 * Exporté par `OrdersModule` et relié au port du réassort dans
 * `appBootstrap/resupply-arrival-feed.module.ts` : `OrdersModule` importe
 * `ResupplyModule`, l'inverse ferait un cycle.
 */
@Injectable()
export class CommerceResupplyArrivals extends ResupplyArrivalSuggestions {
  constructor(private readonly deadlines: SiteDeadlines) {
    super();
  }

  requiredArrivals(day: string, siteIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.deadlines.requiredArrivals(day, siteIds);
  }
}
