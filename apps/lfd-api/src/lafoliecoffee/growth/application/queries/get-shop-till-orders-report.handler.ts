import { SHOP_TILL_ORDERS_MAX_PERIOD_DAYS, type ShopTillOrdersReportView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  ShopTillOrdersPeriod,
  shopTillOrdersRowsOf,
} from "../../domain/shop-till/shop-till-orders-report.js";
import { ShopTillOrdersReader } from "../../domain/ports/shop-till-orders.reader.js";
import { GetShopTillOrdersReportQuery } from "./get-shop-till-orders-report.query.js";

/**
 * **Les commandes notées au comptoir, à régler en boutique** — le suivi à
 * part du CA web (`commande-particulier-reglee-en-boutique.md`, § 4.2) :
 * la période est validée par le domaine AVANT toute lecture, puis les
 * commandes sont rangées par jour et par point. Des montants commandés,
 * jamais encaissés.
 */
@QueryHandler(GetShopTillOrdersReportQuery)
export class GetShopTillOrdersReportHandler implements IQueryHandler<
  GetShopTillOrdersReportQuery,
  ShopTillOrdersReportView
> {
  constructor(private readonly reader: ShopTillOrdersReader) {}

  async execute(query: GetShopTillOrdersReportQuery): Promise<ShopTillOrdersReportView> {
    const period = ShopTillOrdersPeriod.of(query.from, query.to, SHOP_TILL_ORDERS_MAX_PERIOD_DAYS);
    const entries = await this.reader.entries(period.from, period.to);
    return { from: period.from, to: period.to, rows: shopTillOrdersRowsOf(entries) };
  }
}
