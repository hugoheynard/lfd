import type { PackingBagLabelsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { OrderBagLabelReader } from "../../channels/commerce/index.js";
import { OrderLabelHeadReader } from "../../../production/channels/packing/index.js";
import { PackingBoardReader } from "../../domain/ports/packing-board.reader.js";
import { readBagLabels } from "./bag-labels-reading.js";
import { GetBagLabelsQuery } from "./get-bag-labels.query.js";

/**
 * **Les étiquettes des sacs d'une commande, en données** (2026-10-25) — une
 * LECTURE : imprimer ne crée aucun sac, réimprimer non plus. Le papier, lui,
 * est {@link GetBagLabelsPdfHandler} ; les deux lisent par `readBagLabels`.
 *
 * @throws {BagLabelsSheetNotFoundError} la commande n'est pas au poste de ce
 *   jour, ou le fournil ne l'a pas inscrite.
 */
@QueryHandler(GetBagLabelsQuery)
export class GetBagLabelsHandler implements IQueryHandler<GetBagLabelsQuery, PackingBagLabelsView> {
  constructor(
    private readonly board: PackingBoardReader,
    private readonly heads: OrderLabelHeadReader,
    private readonly commerce: OrderBagLabelReader,
  ) {}

  execute(query: GetBagLabelsQuery): Promise<PackingBagLabelsView> {
    const sources = { board: this.board, heads: this.heads, commerce: this.commerce };
    return readBagLabels(sources, query.serviceDay, query.orderId);
  }
}
