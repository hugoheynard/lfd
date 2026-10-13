import { z } from "zod";

import { CUSTOMER_CANCELLATION_REASON_CODES } from "./customer-cancellation.values.js";

/**
 * Contrat de fil de **l'annulation par le client** (lot C6) : les schémas des
 * corps, et le reste par réexport depuis `customer-cancellation.values.ts`
 * (sans zod, pour la boutique).
 *
 * Les schémas ne valident que la FORME : la longueur du motif et le code hors
 * liste sont refusés par le domaine (`CustomerCancellationReason`), avec une
 * phrase.
 */
export {
  CUSTOMER_CANCEL_CODE_PREFIX,
  CUSTOMER_CANCELLATION_MAX_HOURS_BEFORE,
  CUSTOMER_CANCELLATION_REASON_CODES,
  CUSTOMER_CANCELLATION_REASON_MAX_LENGTH,
  CUSTOMER_CANCELLATION_REFUSALS,
  DEFAULT_CUSTOMER_CANCELLATION_SETTINGS,
  type CustomerCancellationMoney,
  type CustomerCancellationReasonCode,
  type CustomerCancellationRefusal,
  type CustomerCancellationSettingsView,
  type GuestOrderCancellationView,
  type OrderCancellability,
  type CustomerOrderDetailView,
} from "./customer-cancellation.values.js";

/** `POST /orders/:id/cancel` — le motif est facultatif (Q-C6.1). */
export const customerCancelOrderPayloadSchema = z.object({
  reasonCode: z.string().optional(),
  reasonText: z.string().optional(),
});
export type CustomerCancelOrderPayload = z.infer<typeof customerCancelOrderPayloadSchema>;

/**
 * `POST /shop/orders/cancellation/view` — le jeton voyage dans le CORPS, jamais
 * dans un chemin (S7).
 */
export const guestCancellationViewPayloadSchema = z.object({
  orderId: z.string().min(1).max(64),
  token: z.string().min(1).max(128),
});
export type GuestCancellationViewPayload = z.infer<typeof guestCancellationViewPayloadSchema>;

/** `POST /shop/orders/cancellation/confirm` — `204`. */
export const guestCancellationConfirmPayloadSchema = guestCancellationViewPayloadSchema.extend({
  reasonCode: z.string().optional(),
  reasonText: z.string().optional(),
});
export type GuestCancellationConfirmPayload = z.infer<typeof guestCancellationConfirmPayloadSchema>;

/** `PATCH /admin/customer-cancellation` — seules les clés présentes changent. */
export const customerCancellationSettingsPatchSchema = z
  .object({
    openToB2c: z.boolean().optional(),
    // La borne (0 à 168 h) est une règle du domaine, refusée avec sa phrase.
    hoursBefore: z.number().int().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "au moins un réglage : openToB2c ou hoursBefore",
  });
export type CustomerCancellationSettingsPatch = z.infer<
  typeof customerCancellationSettingsPatchSchema
>;

/** Les motifs, en schéma — pour qui veut les énumérer côté formulaire. */
export const customerCancellationReasonCodeSchema = z.enum(CUSTOMER_CANCELLATION_REASON_CODES);
