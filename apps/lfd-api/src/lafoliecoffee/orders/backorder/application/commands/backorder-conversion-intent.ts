import type { AdminPlaceOrderPayload } from "@lfd/contracts";

import type { GestureIntent } from "../../../../../platform/intent/gesture-intent.js";
import { intentSubject } from "../../../../../platform/intent/intent-subject.js";
import { orderFingerprint } from "../../../domain/services/order-fingerprint.js";

/** Le nom stable de la transformation d'un reliquat, dans le registre des intentions. */
export const BACKORDER_CONVERSION_GESTURE = "orders.backorder.convert";

/**
 * L'intention d'une transformation : le sujet porte le **reliquat**, puis
 * l'acheteur, le règlement, l'approvisionnement et l'empreinte de la saisie
 * garnie (`orderFingerprint`, société et lignes du reliquat comprises). Un
 * double clic sous la même clé rend la commande déjà passée ; la même clé sur
 * une saisie corrigée après un succès est refusée (409). La réponse gardée
 * est celle de la saisie de l'équipe (`STAFF_PLACEMENT_REPLAY`).
 */
export function backorderConversionIntent(
  staffUserId: string,
  intentKey: string,
  backorderId: string,
  entry: AdminPlaceOrderPayload,
): GestureIntent {
  return {
    actorId: staffUserId,
    key: intentKey,
    gesture: BACKORDER_CONVERSION_GESTURE,
    subject: intentSubject(
      backorderId,
      entry.buyerUserId,
      entry.settlement,
      entry.supply ?? "plan",
      orderFingerprint(entry, entry.companyId),
    ),
  };
}
