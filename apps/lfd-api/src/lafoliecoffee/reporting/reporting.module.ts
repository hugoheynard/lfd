import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { AccountingModule } from "../accounting/accounting.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { GetSalesExportHandler } from "./application/queries/get-sales-export.handler.js";

/**
 * **Le reporting** — l'export des ventes pour la Direction
 * (`documentation/commandes/export/plan-export-des-ventes.md`). Il ne possède
 * aucune table : il compose les lectures que leurs propriétaires publient —
 * commandes (`OrdersModule`), avoirs (`AccountingModule`), familles
 * (`CatalogModule`), sociétés (`AccountModule`) — et l'argent rendu, lu par le
 * canal de `payment` que `CardPaymentModule` (global) fournit.
 */
@Module({
  imports: [OrdersModule, AccountingModule, CatalogModule, AccountModule],
  providers: [GetSalesExportHandler],
})
export class ReportingModule {}
