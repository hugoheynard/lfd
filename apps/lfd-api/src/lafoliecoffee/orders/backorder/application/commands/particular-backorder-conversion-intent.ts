import { BACKORDER_PARTICULAR_VENUES } from "@lfd/contracts";

import type { GestureIntent, IntentRecord } from "../../../../../platform/intent/gesture-intent.js";
import { IntentRecordUnreadableError } from "../../../../../platform/intent/intent-errors.js";
import { intentSubject } from "../../../../../platform/intent/intent-subject.js";
import {
  type IntentCodec,
  readIntentString,
} from "../../../../../platform/intent/once-per-intent.js";
import { orderFingerprint } from "../../../domain/services/order-fingerprint.js";
import type { ParticularBackorderConvertEntry } from "../particular-backorder-entry.js";
import type { ConvertParticularBackorderResult } from "./convert-particular-backorder.command.js";

/** Le nom stable de la transformation d'un reliquat de particulier, dans le registre des intentions. */
export const PARTICULAR_BACKORDER_CONVERSION_GESTURE = "orders.backorder.convert-particular";

/**
 * L'intention : le **reliquat**, l'acheteur, le lieu de règlement et
 * l'empreinte du panier garni (sans société). Un double clic sous la même
 * clé rend la commande déjà passée ; la même clé sur un panier corrigé après
 * un succès est refusée (409). Le texte du motif n'y entre pas, comme pour
 * l'offerte ordinaire.
 */
export function particularBackorderConversionIntent(
  staffUserId: string,
  intentKey: string,
  backorderId: string,
  entry: ParticularBackorderConvertEntry,
): GestureIntent {
  return {
    actorId: staffUserId,
    key: intentKey,
    gesture: PARTICULAR_BACKORDER_CONVERSION_GESTURE,
    subject: intentSubject(
      backorderId,
      entry.payload.buyerUserId,
      entry.venue,
      orderFingerprint(entry.payload, null),
    ),
  };
}

/**
 * Ce que la transformation rend, gardé et relu au rejeu. Le total est rangé
 * en chaîne (le registre ne range que des chaînes, des booléens et `null`).
 */
export const PARTICULAR_BACKORDER_CONVERSION_REPLAY: IntentCodec<ConvertParticularBackorderResult> =
  {
    write: (result): IntentRecord => ({
      id: result.id,
      orderNumber: result.orderNumber,
      venue: result.venue,
      totalCents: String(result.totalCents),
    }),
    read: (record, gesture) => {
      const totalCents = Number(readIntentString(record, "totalCents", gesture));
      if (!Number.isSafeInteger(totalCents)) {
        throw new IntentRecordUnreadableError(gesture, "totalCents");
      }
      const written = readIntentString(record, "venue", gesture);
      const venue = BACKORDER_PARTICULAR_VENUES.find((known) => known === written);
      if (venue === undefined) {
        throw new IntentRecordUnreadableError(gesture, "venue");
      }
      return {
        id: readIntentString(record, "id", gesture),
        orderNumber: readIntentString(record, "orderNumber", gesture),
        venue,
        totalCents,
      };
    },
  };
