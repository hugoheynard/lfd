import { Global, Module } from "@nestjs/common";

import { OrdersDayVersionSource } from "../b2b/orders/application/services/orders-day-version.source.js";
import { OrdersModule } from "../b2b/orders/orders.module.js";
import { DeliveryDayVersionSource } from "../delivery/application/delivery-day-version.source.js";
import { MyRoundDayVersionSource } from "../delivery/application/my-round-day-version.source.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { DayVersionRegistry } from "../platform/day-versions/day-version-registry.js";
import { DayVersionsModule } from "../platform/day-versions/day-versions.module.js";
import { ProductionDayVersionSource } from "../production/application/services/production-day-version.source.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Le registre des versions de journée, relié** (`version-par-journee.md`,
 * D8, 2026-11-03). `platform/day-versions/` déclare le port
 * `DayVersionSource` et sert la porte unique `GET admin/day-versions` ; chaque
 * bloc qui tient un journal l'implémente chez lui. Ce module est le SEUL
 * endroit qui les nomme ensemble : un journal de plus est une source de plus
 * dans cette liste, jamais une route de plus.
 *
 * Le registre refuse de se construire si un journal du contrat (`DAY_JOURNALS`)
 * n'a pas de source ou en a deux : l'API ne démarre pas.
 *
 * `@Global` pour la raison des autres fils : le consommateur du registre est
 * `platform`, qui ne peut importer aucun module métier.
 */
@Global()
@Module({
  imports: [OrdersModule, ProductionModule, DeliveryModule, DayVersionsModule],
  providers: [
    {
      provide: DayVersionRegistry,
      useFactory: (
        orders: OrdersDayVersionSource,
        production: ProductionDayVersionSource,
        delivery: DeliveryDayVersionSource,
        myRound: MyRoundDayVersionSource,
      ) => new DayVersionRegistry([orders, production, delivery, myRound]),
      inject: [
        OrdersDayVersionSource,
        ProductionDayVersionSource,
        DeliveryDayVersionSource,
        MyRoundDayVersionSource,
      ],
    },
  ],
  exports: [DayVersionRegistry],
})
export class DayVersionSourcesModule {}
