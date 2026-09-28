import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { QualityHoldsReader } from "../../../production/channels/handover/index.js";

/**
 * **Une commande est-elle retenue au contrôle ?** — la question du geste et de
 * l'écran avant le geste, posée au port par lot avec une liste d'un élément.
 *
 * Le jour demandé est celui qui range la commande dans un plan de production
 * (`PrismaDayOrdersReader` lit `requested_delivery_date`, vérifié le
 * 2026-09-28). Sans lui, la commande n'est dans aucun plan, et aucun contrôle ne
 * peut la viser : la réponse est « non » sans rien demander.
 */
export async function isHeldForQuality(
  holds: QualityHoldsReader,
  subject: HandoverSubject,
): Promise<boolean> {
  if (subject.requestedDeliveryDate === null) {
    return false;
  }
  const day = subject.requestedDeliveryDate.toISOString().slice(0, 10);
  const held = await holds.heldOrders(day, [subject.orderId]);
  return held.has(subject.orderId);
}
