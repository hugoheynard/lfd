import { z } from "zod";

import {
  deliveryAddressIssue,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  idempotencyKeySchema,
  orderContentShape,
  pickupPointIssue,
} from "./order.js";

/**
 * **Commander sans compte** — plan
 * `documentation/b2b/plan-commande-sans-compte.md`, §5 et lot C.
 *
 * ## Pourquoi un contrat de plus, et pas un champ de plus sur `placeOrderPayloadSchema`
 *
 * Parce que le chemin authentifié marche, et que la décision qui a refondu le
 * plan était de « ne pas polluer notre travail qui marchait bien pour les
 * porteurs d'identité ». Les deux surfaces décrivent le même panier — d'où
 * `orderContentShape`, partagé — et divergent sur tout le reste :
 *
 * - **l'identité est dans le corps**, ici et nulle part ailleurs. Sur la surface
 *   connectée elle vient du jeton, et la société du contexte ; les recevoir du
 *   corps y serait la faille que ces deux mécanismes existent pour fermer ;
 * - **pas de `settlement`** : c'est la carte, toujours. Le compte se négocie
 *   avec une société cliente, et il n'y en a pas ;
 * - **pas de société**, pour la même raison, et elle reste inexprimable — un
 *   visiteur ne peut pas en nommer une.
 */

/** La longueur d'un prénom, bornée comme le domaine la borne (`PersonName`). */
const FIRST_NAME_MAX_LENGTH = 80;

/** Une adresse en pratique (RFC 5321), comme `EmailAddress` la borne. */
const EMAIL_MAX_LENGTH = 254;

/**
 * **Qui commande**, quand personne ne peut le dire à notre place.
 *
 * Les trois champs que l'écran du panier demande déjà — ce sont exactement ceux
 * que `AuthFacade.register(target, profile)` recueille pour qui *veut* un
 * compte (plan §8 bis). La porte est la même, la suite diffère.
 *
 * ⚠️ **Ce n'est pas une preuve d'identité.** Rien ici n'atteste que l'adresse
 * appartient à qui la tape, et c'est assumé (D2) : deux lignes, deux histoires.
 * Ce qui en découle vit ailleurs — cette personne n'aura aucune identité de
 * connexion, donc rien de ce qui est tapé au panier ne donne accès à quoi que
 * ce soit.
 *
 * L'adresse est **obligatoire**, et c'est le seul champ qui l'est vraiment :
 * sans elle, pas de confirmation, pas de QR de retrait, pas de code à présenter
 * au comptoir. Le téléphone reste facultatif — il sert à rappeler, pas à
 * identifier.
 */
export const guestBuyerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "prénom requis")
    .max(FIRST_NAME_MAX_LENGTH, `prénom : au plus ${String(FIRST_NAME_MAX_LENGTH)} caractères`),
  email: z
    .string()
    .trim()
    .min(1, "e-mail requis")
    .max(EMAIL_MAX_LENGTH, `e-mail : au plus ${String(EMAIL_MAX_LENGTH)} caractères`)
    .email("e-mail invalide"),
  /** Vide = non communiqué. Une chaîne vide, jamais `null` : comme en base. */
  phone: z.string().trim().max(32, "téléphone : au plus 32 caractères").default(""),
});
export type GuestBuyerPayload = z.infer<typeof guestBuyerSchema>;

/**
 * La charge de `POST /shop/orders`.
 *
 * 🔴 **Aucun `settlement`, aucun `companyId`.** Les deux sont absents par
 * décision, pas par oubli : la commande publique se règle par carte (il n'y a
 * pas de crédit à accorder à un panier), et la société reste **inexprimable**,
 * ce qui est le cran au-dessus d'un refus.
 *
 * La clé d'idempotence, elle, est la même — et elle vit dans le corps pour la
 * même raison qu'ailleurs : un appel sans clé doit être inexprimable, pas
 * seulement découragé. Ce qu'elle rend au rejeu diffère, et c'est le sujet de
 * `ShopOrderIdempotencyStore` : jamais un secret de paiement.
 */
export const placeShopOrderPayloadSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    buyer: guestBuyerSchema,
    ...orderContentShape,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue());
export type PlaceShopOrderPayload = z.infer<typeof placeShopOrderPayloadSchema>;
