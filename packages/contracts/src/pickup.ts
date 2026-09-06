import { z } from "zod";

import {
  billingAddressPayloadSchema,
  type FulfillmentWindow,
  fulfillmentWindowSchema,
} from "./address.js";
import { cartAdjustmentSchema, type CartAdjustment } from "./cart-adjustment.js";
import { minutesOfDay, timeOfMinutes } from "./paris-time.js";

/**
 * Contrat de fil des **points de retrait** (laboratoires) — adresses **globales**
 * (pas par entreprise), fallback d'acheminement tant que la livraison n'existe
 * pas. Plusieurs points possibles, un seul par défaut. Chaque point peut porter
 * une **remise** (retirer coûte moins cher : ex. labo −20 %) appliquée au panier
 * quand la commande est retirée là.
 */

/**
 * Les heures où un professionnel peut venir chercher sa commande.
 *
 * **Deux fenêtres nommées, jamais fusionnées.** L'ouverture au public et le
 * créneau réservé aux pros ne se touchent pas forcément — 5h–6h30 pour les pros
 * puis 7h–20h au public laisse une demi-heure fermée. Les aplatir en un seul
 * « range total » inventerait une disponibilité qui n'existe pas, et un client
 * se présenterait devant une porte close.
 *
 * La disponibilité se lit donc « contenue dans **l'une** des deux ».
 */
export const pickupOpeningSchema = z.object({
  /** Ouverture au public. `null` = le point ne reçoit pas de public. */
  publicOpening: fulfillmentWindowSchema.nullable().default(null),
  /** Créneau réservé au retrait pro. `null` = pas de créneau dédié. */
  proPickup: fulfillmentWindowSchema.nullable().default(null),
});
export type PickupOpening = z.infer<typeof pickupOpeningSchema>;

/**
 * Les fenêtres où un pro peut se présenter, la plus matinale en tête. Vide = le
 * point n'a aucune heure déclarée — l'écran doit alors le dire plutôt que
 * d'accepter n'importe quelle heure.
 */
export function pickupWindows(opening: PickupOpening): readonly FulfillmentWindow[] {
  return [opening.proPickup, opening.publicOpening]
    .filter((window): window is FulfillmentWindow => window !== null)
    .sort((a, b) => (a.start ?? "00:00").localeCompare(b.start ?? "00:00"));
}

/** Charge de création/édition d'un point de retrait : champs postaux + défaut +
 *  remise optionnelle (`null` = aucune remise) + heures d'ouverture. */
export const pickupAddressPayloadSchema = billingAddressPayloadSchema.extend({
  isDefault: z.boolean().default(false),
  discount: cartAdjustmentSchema.nullable().default(null),
  opening: pickupOpeningSchema.default({ publicOpening: null, proPickup: null }),
});
export type PickupAddressPayload = z.infer<typeof pickupAddressPayloadSchema>;

/** Un point de retrait tel que renvoyé (le défaut en tête). */
export interface PickupAddressView {
  readonly id: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly isDefault: boolean;
  /** Remise appliquée au panier en cas de retrait ici, ou `null`. */
  readonly discount: CartAdjustment | null;
  /** Quand on peut venir — cf. {@link pickupOpeningSchema}. */
  readonly opening: PickupOpening;
}

/** Réponse de création d'un point de retrait. */
export interface CreatedPickupResponse {
  readonly id: string;
}

/**
 * **Qui peut se présenter** sur ce créneau.
 *
 * Deux valeurs seulement, et elles se lisent sur les deux fenêtres du point :
 * `pro` est une heure couverte par le créneau réservé et par lui SEUL. Tout le
 * reste est `public` — y compris l'heure où les deux fenêtres se chevauchent,
 * parce qu'un pro peut évidemment venir quand la boutique est ouverte.
 */
export type PickupAccess = "public" | "pro";

/** Une heure où l'on peut venir chercher sa commande. */
export interface PickupSlot {
  /** `07:00-08:00`, ou `-08:00` quand la fenêtre n'a pas de borne basse. */
  readonly id: string;
  /** `null` = « avant `end` » : le point n'a pas déclaré son ouverture. */
  readonly start: string | null;
  readonly end: string;
  readonly access: PickupAccess;
}

/** Une heure pleine, en minutes. */
const HOUR = 60;

/**
 * **La grille de créneaux d'un point de retrait**, déduite de ses heures.
 *
 * 🔴 Elle était écrite en dur dans le front (`ORDER_SLOTS`) : huit heures fixes,
 * les mêmes pour tous les points, avec des états inventés — « complet »,
 * « sortie du four ». Aucun n'avait de source : le système ne connaît ni la
 * capacité d'un créneau ni l'heure d'enfournement. Un client lisait donc
 * « complet » sur une heure libre, et « disponible » sur une heure où la porte
 * est fermée.
 *
 * Ce qui a une source, c'est l'ouverture : deux fenêtres nommées, saisies par le
 * staff. Cette fonction n'en déduit rien de plus qu'elles ne disent.
 *
 * ## Découpe
 *
 * Une **heure pleine** par créneau, la dernière tronquée à la fermeture : une
 * fenêtre `05:00–06:30` rend `05:00–06:00` puis `06:00–06:30`. Jeter la demie
 * ferait disparaître une demi-heure d'ouverture réelle ; l'arrondir à `07:00`
 * enverrait quelqu'un devant une porte close.
 *
 * ⚠️ Une fenêtre **sans borne basse** ne se découpe pas : « avant 8 h » ne dit
 * pas depuis quand, et remplir la nuit depuis minuit inventerait une ouverture.
 * Elle rend **un** créneau, tel quel.
 *
 * @returns les créneaux dans l'ordre de l'horloge. Vide = le point n'a déclaré
 * aucune heure, et l'écran doit le dire plutôt que proposer n'importe quand.
 */
export function pickupSlots(opening: PickupOpening): readonly PickupSlot[] {
  const byId = new Map<string, PickupSlot>();
  // Le pro d'ABORD, le public ENSUITE : la seconde passe écrase, donc une heure
  // couverte par les deux finit `public`. C'est le sens voulu — « réservé » ne
  // qualifie que ce que le public n'a pas.
  for (const [access, window] of [
    ["pro", opening.proPickup],
    ["public", opening.publicOpening],
  ] as const) {
    for (const slot of cut(window, access)) {
      byId.set(slot.id, slot);
    }
  }
  return [...byId.values()].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
}

/** Découpe une fenêtre en heures pleines. Rien pour une fenêtre absente. */
function cut(window: FulfillmentWindow | null, access: PickupAccess): readonly PickupSlot[] {
  if (window === null) {
    return [];
  }
  if (window.start === null) {
    return [{ id: `-${window.end}`, start: null, end: window.end, access }];
  }
  const end = minutesOfDay(window.end);
  const slots: PickupSlot[] = [];
  for (let at = minutesOfDay(window.start); at < end; at += HOUR) {
    const start = timeOfMinutes(at);
    const stop = timeOfMinutes(Math.min(at + HOUR, end));
    slots.push({ id: `${start}-${stop}`, start, end: stop, access });
  }
  return slots;
}
