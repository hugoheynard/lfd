import type { PackingResuppliesView, PackingResupplyView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { type PackingResupplySnapshot, titleOf } from "../../domain/entities/packing-resupply.js";
import type { PackingStockSnapshot } from "../../domain/entities/packing-stock.js";
import { PackingDayStocksReader } from "../../domain/ports/packing-day-stocks.reader.js";
import { PackingResupplyBoardReader } from "../../domain/ports/packing-resupply-board.reader.js";
import { awaitingOvenOf } from "../../domain/services/stock-reservations.js";
import { ListPackingResuppliesQuery } from "./list-packing-resupplies.query.js";

/**
 * Les fiches de réassort du jour, pour le poste de colisage (réassort, lot
 * R3b). Destination : le transfert vers le point — seul un point servi par
 * transfert a une fiche (§13.4, Q1 révisée).
 *
 * Les fiches « au plus tôt » (R4b) viennent en tête, dans l'ordre de leur
 * lancement ; chacune de leurs lignes dit ce qu'elle attend encore du four —
 * la règle même de `PackingStock.takeForResupply`.
 */
@QueryHandler(ListPackingResuppliesQuery)
export class ListPackingResuppliesHandler implements IQueryHandler<
  ListPackingResuppliesQuery,
  PackingResuppliesView
> {
  constructor(
    private readonly board: PackingResupplyBoardReader,
    private readonly stocks: PackingDayStocksReader,
  ) {}

  async execute(query: ListPackingResuppliesQuery): Promise<PackingResuppliesView> {
    const [sheets, stocks] = await Promise.all([
      this.board.on(query.serviceDay),
      this.stocks.on(query.serviceDay),
    ]);
    const bySku = new Map(stocks.map((stock) => [stock.sku, stock] as const));
    return {
      date: query.serviceDay,
      resupplies: [...launchedFirst(sheets)].map((sheet) => viewOf(sheet, bySku)),
    };
  }
}

function launchedFirst(
  sheets: readonly PackingResupplySnapshot[],
): readonly PackingResupplySnapshot[] {
  const asap = sheets
    .filter((sheet) => sheet.kind === "asap")
    .sort((a, b) => a.drawnAt.getTime() - b.drawnAt.getTime());
  return [...asap, ...sheets.filter((sheet) => sheet.kind !== "asap")];
}

function viewOf(
  sheet: PackingResupplySnapshot,
  stocks: ReadonlyMap<string, PackingStockSnapshot>,
): PackingResupplyView {
  const lines = sheet.lines.map((line) => {
    const stock = stocks.get(line.sku);
    return {
      sku: line.sku,
      productName: line.productName,
      requested: line.quantity,
      packed: line.packed?.quantity ?? null,
      awaitingOven:
        stock === undefined ? 0 : awaitingOvenOf(stock, stock.reservations, sheet.resupplyId),
    };
  });
  return {
    resupplyId: sheet.resupplyId,
    title: titleOf(sheet.siteLabel, sheet.siteId, sheet.name, sheet.kind),
    kind: sheet.kind,
    siteId: sheet.siteId,
    destination: { kind: "transfer", siteId: sheet.siteId },
    status: sheet.closed === null ? "open" : "closed",
    awaitingOven: sheet.closed === null && lines.some((line) => line.awaitingOven > 0),
    closedAt: sheet.closed?.at.toISOString() ?? null,
    lines,
  };
}
