import { Global, Module } from "@nestjs/common";

import { CommerceResupplyArrivals } from "../lafoliecoffee/orders/application/services/commerce-resupply-arrivals.service.js";
import { OrdersModule } from "../lafoliecoffee/orders/orders.module.js";
import { ResupplyArrivalSuggestions } from "../lafoliecoffee/resupply/domain/resupply-arrival-suggestions.js";

/**
 * **L'heure d'arrivée proposée au réassort, reliée** (plan
 * `reassort-boutiques/plan-heure-du-reassort.md`, H-D3). Le réassort
 * DÉCLARE `ResupplyArrivalSuggestions` ; les commandes l'IMPLÉMENTENT, parce
 * qu'elles portent la règle de l'heure requise d'un point. Câblé ici et pas
 * dans un des deux modules : `OrdersModule` importe `ResupplyModule`, et
 * l'inverse ferait un cycle — la figure de `ShelfDrawsFeedModule`.
 */
@Global()
@Module({
  imports: [OrdersModule],
  providers: [{ provide: ResupplyArrivalSuggestions, useExisting: CommerceResupplyArrivals }],
  exports: [ResupplyArrivalSuggestions],
})
export class ResupplyArrivalFeedModule {}
