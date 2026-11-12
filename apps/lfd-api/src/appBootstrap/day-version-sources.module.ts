import { Global, Module } from "@nestjs/common";

import { CompaniesVersionSource } from "../lafoliecoffee/account/application/services/companies-version.source.js";
import { AccountModule } from "../lafoliecoffee/account/account.module.js";
import { CatalogAdminVersionSource } from "../lafoliecoffee/catalog/application/catalog-admin-version.source.js";
import { CatalogModule } from "../lafoliecoffee/catalog/catalog.module.js";
import { AllOrdersVersionSource } from "../lafoliecoffee/orders/application/services/all-orders-version.source.js";
import { OrdersDayVersionSource } from "../lafoliecoffee/orders/application/services/orders-day-version.source.js";
import { OrdersModule } from "../lafoliecoffee/orders/orders.module.js";
import { DeliveryDayVersionSource } from "../delivery/application/delivery-day-version.source.js";
import { MyRoundDayVersionSource } from "../delivery/application/my-round-day-version.source.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { DayVersionRegistry } from "../platform/day-versions/day-version-registry.js";
import { DayVersionsModule } from "../platform/day-versions/day-versions.module.js";
import { VersionRegistry } from "../platform/day-versions/version-registry.js";
import { PimVersionSource } from "../pim/changes/application/pim-version.source.js";
import { PimChangesModule } from "../pim/changes/pim-changes.module.js";
import { ProductionDayVersionSource } from "../production/application/services/production-day-version.source.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Le registre des sujets de version, relié** (`version-par-journee.md`, D8 ;
 * `le-cache-du-back-office.md`, § 2.1). `platform/day-versions/` déclare les
 * ports `DayVersionSource` (portée journée) et `GlobalVersionSource` (portée
 * globale) et sert les portes `GET admin/versions` et `admin/day-versions` ;
 * chaque bloc qui tient un journal les implémente chez lui. Ce module est le
 * SEUL endroit qui les nomme ensemble : un sujet de plus est une source de
 * plus dans cette liste, jamais une route de plus.
 *
 * Les registres refusent de se construire si un sujet du contrat
 * (`DAY_JOURNALS`, `GLOBAL_VERSION_SUBJECTS`) n'a pas de source ou en a deux :
 * l'API ne démarre pas.
 *
 * `@Global` pour la raison des autres fils : le consommateur du registre est
 * `platform`, qui ne peut importer aucun module métier.
 */
@Global()
@Module({
  imports: [
    OrdersModule,
    AccountModule,
    CatalogModule,
    ProductionModule,
    DeliveryModule,
    PimChangesModule,
    DayVersionsModule,
  ],
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
    {
      provide: VersionRegistry,
      useFactory: (
        days: DayVersionRegistry,
        companies: CompaniesVersionSource,
        allOrders: AllOrdersVersionSource,
        catalogAdmin: CatalogAdminVersionSource,
        pim: PimVersionSource,
      ) => new VersionRegistry(days, [companies, allOrders, catalogAdmin, pim]),
      inject: [
        DayVersionRegistry,
        CompaniesVersionSource,
        AllOrdersVersionSource,
        CatalogAdminVersionSource,
        PimVersionSource,
      ],
    },
  ],
  exports: [DayVersionRegistry, VersionRegistry],
})
export class DayVersionSourcesModule {}
