import type { PackingResuppliesView, PackingResupplyView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { type PackingResupplySnapshot, titleOf } from "../../domain/entities/packing-resupply.js";
import { PackingResupplyBoardReader } from "../../domain/ports/packing-resupply-board.reader.js";
import { ListPackingResuppliesQuery } from "./list-packing-resupplies.query.js";

/**
 * Les fiches de réassort du jour, pour le poste de colisage (réassort, lot
 * R3b). Destination : le transfert vers le point — seul un point servi par
 * transfert a une fiche (§13.4, Q1 révisée).
 */
@QueryHandler(ListPackingResuppliesQuery)
export class ListPackingResuppliesHandler implements IQueryHandler<
  ListPackingResuppliesQuery,
  PackingResuppliesView
> {
  constructor(private readonly board: PackingResupplyBoardReader) {}

  async execute(query: ListPackingResuppliesQuery): Promise<PackingResuppliesView> {
    const sheets = await this.board.on(query.serviceDay);
    return { date: query.serviceDay, resupplies: sheets.map(viewOf) };
  }
}

function viewOf(sheet: PackingResupplySnapshot): PackingResupplyView {
  return {
    resupplyId: sheet.resupplyId,
    title: titleOf(sheet.siteLabel, sheet.siteId, sheet.name),
    siteId: sheet.siteId,
    destination: { kind: "transfer", siteId: sheet.siteId },
    status: sheet.closed === null ? "open" : "closed",
    closedAt: sheet.closed?.at.toISOString() ?? null,
    lines: sheet.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      requested: line.quantity,
      packed: line.packed?.quantity ?? null,
    })),
  };
}
