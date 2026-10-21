import type { ResupplyReceiptView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PackedResuppliesReader } from "../../../packing/channels/commerce/index.js";
import { estimateStock } from "../domain/estimated-stock.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import { ResupplyReceiptReader } from "../domain/resupply-receipt.reader.js";
import { isPlaced } from "../domain/site-resupply.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { GetResupplyReceiptQuery } from "./get-resupply-receipt.query.js";
import { receptionView, unorderedView } from "./resupply-receipt-view.js";

/**
 * Sert la page de réception d'un point pour une journée (lot R2) : les
 * réassorts envoyés qui la visent — « au plus tôt » du jour et « pour
 * demain » de la veille ont la même journée —, chacun avec sa réception, le
 * réassort sans commande, et le stock estimé, somme des reçus. Un réassort
 * annulé n'est servi que s'il avait déjà été réceptionné : ce qui est arrivé
 * reste arrivé. Lecture pure : rien ne s'ouvre.
 */
@QueryHandler(GetResupplyReceiptQuery)
export class GetResupplyReceiptHandler implements IQueryHandler<
  GetResupplyReceiptQuery,
  ResupplyReceiptView
> {
  constructor(
    private readonly receipts: ResupplyReceiptReader,
    private readonly resupplies: SiteResupplyReader,
    private readonly packed: PackedResuppliesReader,
  ) {}

  async execute(query: GetResupplyReceiptQuery): Promise<ResupplyReceiptView> {
    const [snapshots, resupplies] = await Promise.all([
      this.receipts.on(query.siteId, query.serviceDay),
      this.resupplies.forSite(query.siteId, [query.serviceDay]),
    ]);
    const receipts = snapshots.map((snapshot) => ResupplyReceipt.restore(snapshot));
    const byResupply = new Map(
      receipts.flatMap((receipt) =>
        receipt.resupplyId === null ? [] : [[receipt.resupplyId, receipt] as const],
      ),
    );
    const served = resupplies
      .filter(isPlaced)
      .filter((resupply) => resupply.cancelled === null || byResupply.has(resupply.id))
      .sort((a, b) => a.placed.at.getTime() - b.placed.at.getTime() || a.id.localeCompare(b.id));
    // L'emballé au colisage, pour l'attendu de ceux qui ne sont pas encore reçus (R3b).
    const packed = await this.packed.packedOf(
      served.filter((resupply) => !byResupply.has(resupply.id)).map((resupply) => resupply.id),
    );
    const receptions = served.map((resupply) =>
      receptionView(resupply, byResupply.get(resupply.id) ?? null, packed.get(resupply.id) ?? null),
    );
    return {
      siteId: query.siteId,
      serviceDay: query.serviceDay,
      receptions,
      unordered: unorderedView(receipts.find((receipt) => receipt.resupplyId === null) ?? null),
      stock: estimateStock(receipts),
    };
  }
}
