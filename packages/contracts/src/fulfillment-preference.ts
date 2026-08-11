import { z } from "zod";

import { fulfillmentMethodSchema, type FulfillmentMethod } from "./order.js";

/**
 * **Préférence d'acheminement** d'une société : comment ce client est servi
 * d'habitude.
 *
 * Ce n'est pas une contrainte, c'est un **point de départ** — la commande
 * s'ouvre dessus, et le client peut en changer au panier. La distinction
 * compte : un réglage qui interdit se contourne par un appel au commercial ; un
 * réglage qui propose fait gagner trois clics à chaque commande sans jamais
 * bloquer personne.
 *
 * **`null` veut dire « le défaut », pas « rien ».** Un point de retrait ou une
 * adresse à `null` renvoie au défaut du moment — celui de la plateforme pour le
 * retrait, celui de la société pour la livraison. Pointer explicitement sur
 * l'adresse par défaut la figerait : le jour où elle change, la préférence
 * continuerait de désigner l'ancienne, sans que personne ne s'en aperçoive.
 */
export const fulfillmentPreferencePayloadSchema = z.object({
  method: fulfillmentMethodSchema,
  /** Point de retrait préféré ; `null` = celui par défaut de la plateforme. */
  pickupAddressId: z.string().trim().min(1).nullable().default(null),
  /** Adresse de livraison préférée ; `null` = celle par défaut de la société. */
  deliveryAddressId: z.string().trim().min(1).nullable().default(null),
});
export type FulfillmentPreferencePayload = z.infer<typeof fulfillmentPreferencePayloadSchema>;

/**
 * La préférence telle qu'elle est lue.
 *
 * `method` à `null` signifie qu'**aucune préférence n'a été posée** : le client
 * choisira comme aujourd'hui. C'est l'état de tout le portefeuille existant, et
 * il doit rester lisible — « pas encore réglé » n'est pas « retrait ».
 */
export interface FulfillmentPreferenceView {
  readonly method: FulfillmentMethod | null;
  readonly pickupAddressId: string | null;
  readonly deliveryAddressId: string | null;
}

/** Aucune préférence posée — l'état de départ de toute société. */
export const NO_FULFILLMENT_PREFERENCE: FulfillmentPreferenceView = {
  method: null,
  pickupAddressId: null,
  deliveryAddressId: null,
};
