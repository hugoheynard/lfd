import type { CounterParticularOrderPayload } from "@lfd/contracts";

import type { GestureIntent, IntentRecord } from "../../../../platform/intent/gesture-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { IntentRecordUnreadableError } from "../../../../platform/intent/intent-errors.js";
import { type IntentCodec, readIntentString } from "../../../../platform/intent/once-per-intent.js";
import { orderFingerprint } from "../../domain/services/order-fingerprint.js";
import type { PlaceParticularOrderAtCounterResult } from "./place-particular-order-at-counter.command.js";

/** Le nom stable de la commande d'un particulier notée au comptoir, dans le registre des intentions. */
export const PARTICULAR_COUNTER_PLACEMENT_GESTURE = "orders.place-particular-at-counter";

/**
 * L'intention : l'acheteur et l'empreinte du panier (sans société). La même
 * clé renvoyée sur un panier corrigé après un succès est refusée (409) ; après
 * un refus, elle est rendue et le renvoi corrigé repasse. Le total vu n'y
 * entre pas, comme pour les autres passations.
 */
export function particularCounterPlacementIntent(
  staffUserId: string,
  intentKey: string,
  payload: CounterParticularOrderPayload,
): GestureIntent {
  return {
    actorId: staffUserId,
    key: intentKey,
    gesture: PARTICULAR_COUNTER_PLACEMENT_GESTURE,
    subject: intentSubject(payload.buyerUserId, orderFingerprint(payload, null)),
  };
}

/**
 * Ce que la passation rend, gardé et relu au rejeu. Le total est rangé en
 * chaîne (le registre ne range que des chaînes, des booléens et `null`).
 */
export const PARTICULAR_COUNTER_PLACEMENT_REPLAY: IntentCodec<PlaceParticularOrderAtCounterResult> =
  {
    write: (result): IntentRecord => ({
      id: result.id,
      orderNumber: result.orderNumber,
      totalCents: String(result.totalCents),
    }),
    read: (record, gesture) => {
      const totalCents = Number(readIntentString(record, "totalCents", gesture));
      if (!Number.isSafeInteger(totalCents)) {
        throw new IntentRecordUnreadableError(gesture, "totalCents");
      }
      return {
        id: readIntentString(record, "id", gesture),
        orderNumber: readIntentString(record, "orderNumber", gesture),
        totalCents,
      };
    },
  };
