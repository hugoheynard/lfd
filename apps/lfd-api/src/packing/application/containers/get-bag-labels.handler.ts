import type { PackingBagLabelsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { OrderBagLabelReader } from "../../channels/commerce/index.js";
import { OrderLabelHeadReader } from "../../../production/channels/packing/index.js";
import { BagLabelsSheetNotFoundError } from "../../domain/errors/packing-bag-label-errors.js";
import { PackingBoardReader } from "../../domain/ports/packing-board.reader.js";
import { bagLabelsOf } from "../../domain/services/bag-labels.js";
import { GetBagLabelsQuery } from "./get-bag-labels.query.js";

/**
 * **Les étiquettes des sacs d'une commande** (2026-10-25, demande de Hugo) —
 * une LECTURE : imprimer ne crée aucun sac, réimprimer non plus.
 *
 * Trois lectures, chacune chez qui la tient :
 *
 * - les sacs vivants, aux tables du colisage (`PackingBoardReader`) ;
 * - le libellé et le créneau, au fournil, composés par les fonctions de ses
 *   papiers (`OrderLabelHeadReader`) — l'étiquette dit ce que dit le bon ;
 * - la couleur et le QR de retrait, au commerce (`OrderBagLabelReader`).
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

  async execute(query: GetBagLabelsQuery): Promise<PackingBagLabelsView> {
    const [day, head, facts] = await Promise.all([
      this.board.dayOf(query.serviceDay),
      this.heads.headOf(query.serviceDay, query.orderId),
      this.commerce.factsOf(query.orderId),
    ]);
    const order = day.orders.find((candidate) => candidate.orderId === query.orderId);
    if (order === undefined || head === null) {
      throw new BagLabelsSheetNotFoundError(query.serviceDay);
    }
    return bagLabelsOf(order, head, facts);
  }
}
