import type { PackingBagLabelsView } from "@lfd/contracts";

import { OrderBagLabelReader } from "../../channels/commerce/index.js";
import { OrderLabelHeadReader } from "../../../production/channels/packing/index.js";
import { BagLabelsSheetNotFoundError } from "../../domain/errors/packing-bag-label-errors.js";
import { PackingBoardReader } from "../../domain/ports/packing-board.reader.js";
import { bagLabelsOf } from "../../domain/services/bag-labels.js";

/** Les trois lecteurs d'une étiquette de sac. */
export interface BagLabelSources {
  readonly board: PackingBoardReader;
  readonly heads: OrderLabelHeadReader;
  readonly commerce: OrderBagLabelReader;
}

/**
 * **Ce que disent les étiquettes des sacs d'une commande** — partagé par la
 * lecture des données et par le PDF (2026-10-25) : deux handlers ne
 * s'appellent pas, ils partagent leurs ports.
 *
 * Trois lectures, chacune chez qui la tient : les sacs vivants au colisage,
 * le libellé et le créneau au fournil (les fonctions de ses papiers : l'étiquette
 * dit ce que dit le bon), la couleur et le QR de retrait au commerce.
 *
 * @throws {BagLabelsSheetNotFoundError} la commande n'est pas au poste de ce
 *   jour, ou le fournil ne l'a pas inscrite.
 */
export async function readBagLabels(
  sources: BagLabelSources,
  serviceDay: string,
  orderId: string,
): Promise<PackingBagLabelsView> {
  const [day, head, facts] = await Promise.all([
    sources.board.dayOf(serviceDay),
    sources.heads.headOf(serviceDay, orderId),
    sources.commerce.factsOf(orderId),
  ]);
  const order = day.orders.find((candidate) => candidate.orderId === orderId);
  if (order === undefined || head === null) {
    throw new BagLabelsSheetNotFoundError(serviceDay);
  }
  return bagLabelsOf(order, head, facts);
}
