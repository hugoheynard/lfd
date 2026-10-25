import type { PackingBagLabelsView } from "@lfd/contracts";

import type { BoardOrder } from "../ports/packing-board.reader.js";

/** L'acheminement et le créneau, titrés par le fournil. */
export interface BagLabelHead {
  readonly fulfillmentLabel: string;
  readonly when: string;
}

/** La couleur et le QR, lus au commerce ; `null` : commande qu'il ne connaît pas. */
export interface BagLabelFacts {
  readonly color: string | null;
  readonly handoverUrl: string;
}

/**
 * **Les étiquettes des sacs d'une commande** (2026-10-25) — fonction pure :
 * ce qui s'imprime est testé ici, ce qui se dessine vit à l'écran.
 *
 * « sac n/N » compte les sacs VIVANTS, dans l'ordre de création : un sac
 * annulé n'est plus sur la table, et l'étiquette « 2/3 » d'une commande qui
 * n'a plus que deux sacs ferait chercher un troisième au comptoir. Le libellé
 * du poste (« Sac 3 », rang annulés compris) reste servi à côté, pour
 * retrouver le sac à l'écran.
 *
 * Commande inconnue du commerce : ni carré ni QR — une absence, jamais une
 * valeur devinée.
 */
export function bagLabelsOf(
  order: BoardOrder,
  head: BagLabelHead,
  facts: BagLabelFacts | null,
): PackingBagLabelsView {
  const bags = order.containerList.filter((container) => container.nature === "bag");
  return {
    orderId: order.orderId,
    reference: order.reference,
    customerLabel: order.customerLabel,
    fulfillmentLabel: head.fulfillmentLabel,
    when: head.when,
    color: facts?.color ?? null,
    handoverUrl: facts?.handoverUrl ?? "",
    bags: bags.map((bag, index) => ({
      containerId: bag.id,
      label: bag.label,
      rank: index + 1,
      of: bags.length,
    })),
  };
}
