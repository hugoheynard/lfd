import type { OfferedParticularOrderPayload } from "@lfd/contracts";

import type { GestureIntent, IntentRecord } from "../../../../platform/intent/gesture-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { IntentRecordUnreadableError } from "../../../../platform/intent/intent-errors.js";
import { type IntentCodec, readIntentString } from "../../../../platform/intent/once-per-intent.js";
import { orderFingerprint } from "../../domain/services/order-fingerprint.js";
import type { PlaceOfferedParticularOrderResult } from "./place-offered-particular-order.command.js";

/** Le nom stable de la commande offerte à un particulier, dans le registre des intentions. */
export const OFFERED_PARTICULAR_PLACEMENT_GESTURE = "orders.place-offered-particular";

/**
 * L'intention : l'acheteur, la nature de l'offre et l'empreinte du panier
 * (sans société). La même clé renvoyée sur un panier corrigé après un succès
 * est refusée (409) ; après un refus, elle est rendue. Le texte du motif n'y
 * entre pas : un renvoi du même panier rend la commande déjà offerte.
 */
export function offeredParticularPlacementIntent(
  staffUserId: string,
  intentKey: string,
  payload: OfferedParticularOrderPayload,
): GestureIntent {
  return {
    actorId: staffUserId,
    key: intentKey,
    gesture: OFFERED_PARTICULAR_PLACEMENT_GESTURE,
    subject: intentSubject(
      payload.buyerUserId,
      payload.offer.nature,
      orderFingerprint(payload, null),
    ),
  };
}

/** Un montant rangé en chaîne, relu comme un entier — ou l'erreur qui nomme le champ. */
function readCents(record: IntentRecord, field: string, gesture: string): number {
  const cents = Number(readIntentString(record, field, gesture));
  if (!Number.isSafeInteger(cents)) {
    throw new IntentRecordUnreadableError(gesture, field);
  }
  return cents;
}

/**
 * Ce que la passation rend, gardé et relu au rejeu. Les montants sont rangés
 * en chaîne (le registre ne range que des chaînes, des booléens et `null`).
 */
export const OFFERED_PARTICULAR_PLACEMENT_REPLAY: IntentCodec<PlaceOfferedParticularOrderResult> = {
  write: (result): IntentRecord => ({
    id: result.id,
    orderNumber: result.orderNumber,
    totalCents: String(result.totalCents),
    offeredTotalCents: String(result.offeredTotalCents),
  }),
  read: (record, gesture) => ({
    id: readIntentString(record, "id", gesture),
    orderNumber: readIntentString(record, "orderNumber", gesture),
    totalCents: readCents(record, "totalCents", gesture),
    offeredTotalCents: readCents(record, "offeredTotalCents", gesture),
  }),
};
