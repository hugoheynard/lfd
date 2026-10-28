import { z } from "zod";

import { guestBuyerSchema } from "./shop-order.js";

/**
 * Contrat de fil de **l'ouverture de la boutique à la commande** : le schéma
 * du patch, et le reste par réexport depuis `order-opening.values.ts` (sans
 * zod, pour la boutique).
 */
export {
  DEFAULT_ORDER_OPENING,
  ORDERS_CLOSED_FOR_AUDIENCE,
  ordersOpenTo,
  SERVICE_DAY_BEFORE_FIRST_ORDERABLE_DAY,
  type GuestOrderAdmissionView,
  type MyOrderAdmissionView,
  type OrderOpeningView,
  type PublicOrderOpeningView,
} from "./order-opening.values.js";

/**
 * Un premier jour commandable : une chaîne, ou `null` pour le retirer. La forme
 * seulement — que ce soit un jour du calendrier, c'est le domaine qui le juge.
 */
const firstServiceDayField = z.string().trim().min(1).nullable().optional();

/** Un patch : seuls les champs présents changent, et il en faut au moins un. */
export const orderOpeningPatchSchema = z
  .object({
    ordersOpenToB2b: z.boolean().optional(),
    ordersOpenToB2c: z.boolean().optional(),
    firstServiceDayB2b: firstServiceDayField,
    firstServiceDayB2c: firstServiceDayField,
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message:
      "au moins un réglage à poser : ordersOpenToB2b, ordersOpenToB2c, firstServiceDayB2b ou firstServiceDayB2c",
  });
export type OrderOpeningPatch = z.infer<typeof orderOpeningPatchSchema>;

/**
 * `POST /order-admission/guest` : l'adresse que l'invité a saisie, sous la
 * même forme que celle de sa commande — la question ne doit pas accepter une
 * adresse que la passation refuserait.
 */
export const guestOrderAdmissionPayloadSchema = z.object({
  email: guestBuyerSchema.shape.email,
});
export type GuestOrderAdmissionPayload = z.infer<typeof guestOrderAdmissionPayloadSchema>;
