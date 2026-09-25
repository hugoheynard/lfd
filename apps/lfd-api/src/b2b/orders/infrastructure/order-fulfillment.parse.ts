import { orderFulfillmentSchema, type OrderFulfillment } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import type { HandoverQueueWindow } from "../domain/ports/order.reader.js";

/**
 * **La lecture du JSON `orders.fulfillment`**, écrite UNE fois.
 *
 * Trois lecteurs en ont besoin — la fiche de commande, la file du retrait et la
 * Supervision du jour (`documentation/order/plan-supervision-du-jour.md`). Les
 * deux premiers portaient chacun sa copie, identique au caractère près
 * (constaté le 2026-09-25) ; la troisième en aurait fait une de plus. Une
 * seconde copie d'un parseur ne diverge pas le jour où on l'écrit, mais le jour
 * où l'on corrige l'autre.
 *
 * Interne à `infrastructure/` : il parle `Prisma.JsonValue`, aucun port ne le
 * nomme.
 */

/**
 * L'acheminement convenu, figé en JSON. Validé plutôt que casté — et le **repli
 * est explicite** : une commande antérieure à la colonne n'en porte pas, elle
 * rend alors « rien de convenu, tout par défaut » plutôt qu'un contact inventé.
 */
export function fulfillmentOf(value: Prisma.JsonValue | null): OrderFulfillment {
  const parsed = orderFulfillmentSchema.safeParse(value);
  return parsed.success ? parsed.data : NOTHING_AGREED;
}

/**
 * Le créneau convenu, **avec sa provenance**, ou `null` s'il n'y en a pas.
 *
 * 🔴 La provenance traverse au lieu d'être aplatie. Un `end` en
 * `source: "default"` est une heure d'ouverture recopiée à la passation, pas une
 * promesse : un écran qui ne verrait que l'heure calculerait des retards sur
 * des commandes à qui personne n'a rien promis.
 */
export function windowOf(agreed: OrderFulfillment): HandoverQueueWindow | null {
  const window = agreed.window.value;
  return window === null
    ? null
    : { start: window.start, end: window.end, source: agreed.window.source };
}

/** Ce que dit une commande qui n'a jamais rien convenu : rien, et par défaut. */
const NOTHING_AGREED: OrderFulfillment = {
  window: { value: null, source: "default" },
  contact: { value: null, source: "default" },
  signatureRequired: { value: false, source: "default" },
};
