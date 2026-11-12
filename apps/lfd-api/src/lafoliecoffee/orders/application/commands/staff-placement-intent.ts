import { type AdminPlaceOrderPayload, staffSettlementSchema } from "@lfd/contracts";

import type { GestureIntent, IntentRecord } from "../../../../platform/intent/gesture-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { IntentRecordUnreadableError } from "../../../../platform/intent/intent-errors.js";
import {
  type IntentCodec,
  readIntentChoice,
  readIntentString,
} from "../../../../platform/intent/once-per-intent.js";
import { orderFingerprint } from "../../domain/services/order-fingerprint.js";
import type { PlaceOrderForCustomerResult } from "./place-order-for-customer.command.js";

/** Le nom stable de la passation par l'équipe, dans le registre des intentions. */
export const STAFF_PLACEMENT_GESTURE = "orders.place-for-customer";

/**
 * L'intention d'une passation par l'équipe. Le sujet porte l'acheteur, le
 * règlement, l'approvisionnement et l'empreinte du panier (`orderFingerprint`,
 * la société comprise) : la même clé renvoyée sur un panier corrigé APRÈS un
 * succès est refusée (409), jamais rendue comme la commande d'avant. Après un
 * refus, l'intention est rendue : le renvoi corrigé repasse sous la même clé.
 * Le total vu n'y entre pas, comme pour la passation du client.
 */
export function staffPlacementIntent(
  staffUserId: string,
  intentKey: string,
  payload: AdminPlaceOrderPayload,
): GestureIntent {
  const fingerprint = orderFingerprint(payload, payload.companyId);
  return {
    actorId: staffUserId,
    key: intentKey,
    gesture: STAFF_PLACEMENT_GESTURE,
    subject: intentSubject(
      payload.buyerUserId,
      payload.settlement,
      payload.supply ?? "plan",
      fingerprint,
    ),
  };
}

const NO_PAYMENT_URL = null;

/**
 * Ce que la passation rend, gardé et relu au rejeu : la même réponse que le
 * premier appel. Le total est rangé en chaîne (le registre ne range que des
 * chaînes, des booléens et `null`) et relu comme un entier, sans quoi la
 * relecture lève une erreur nommée. Le lien de règlement est une adresse de
 * la boutique, sans donnée personnelle.
 */
export const STAFF_PLACEMENT_REPLAY: IntentCodec<PlaceOrderForCustomerResult> = {
  write: (result): IntentRecord => ({
    id: result.id,
    orderNumber: result.orderNumber,
    settlement: result.settlement,
    totalCents: String(result.totalCents),
    paymentUrl: result.paymentUrl ?? NO_PAYMENT_URL,
  }),
  read: (record, gesture) => {
    const totalCents = Number(readIntentString(record, "totalCents", gesture));
    if (!Number.isSafeInteger(totalCents)) {
      throw new IntentRecordUnreadableError(gesture, "totalCents");
    }
    const paymentUrl = record["paymentUrl"];
    if (paymentUrl !== null && typeof paymentUrl !== "string") {
      throw new IntentRecordUnreadableError(gesture, "paymentUrl");
    }
    const base = {
      id: readIntentString(record, "id", gesture),
      orderNumber: readIntentString(record, "orderNumber", gesture),
      settlement: readIntentChoice(record, "settlement", gesture, staffSettlementSchema.options),
      totalCents,
    };
    return paymentUrl === null ? base : { ...base, paymentUrl };
  },
};
