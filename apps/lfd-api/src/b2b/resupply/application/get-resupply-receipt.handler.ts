import type { ResupplyReceiptView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { estimateStock } from "../domain/estimated-stock.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";
import { GetResupplyReceiptQuery } from "./get-resupply-receipt.query.js";

/**
 * Sert la liste reçue et son stock estimé. Lecture pure : une journée sans
 * saisie rend une liste vide, sans rien ouvrir.
 */
@QueryHandler(GetResupplyReceiptQuery)
export class GetResupplyReceiptHandler implements IQueryHandler<
  GetResupplyReceiptQuery,
  ResupplyReceiptView
> {
  constructor(private readonly receipts: ResupplyReceiptRepository) {}

  async execute(query: GetResupplyReceiptQuery): Promise<ResupplyReceiptView> {
    const receipt = await this.receipts.load(query.siteId, query.serviceDay);
    const change = receipt?.lastChange ?? null;
    return {
      siteId: query.siteId,
      serviceDay: query.serviceDay,
      lines: receipt === null ? [] : estimateStock(receipt.lines),
      updatedAt: change === null ? null : change.at.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
      updatedBy: change === null || change.author.name === "" ? null : change.author.name,
    };
  }
}
