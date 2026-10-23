import { z } from "zod";

import {
  billingAddressPayloadSchema,
  type FulfillmentWindow,
  fulfillmentWindowSchema,
  type GpsPoint,
  gpsPointSchema,
} from "./address.js";
import { cartAdjustmentSchema } from "./cart-adjustment.js";
import { minutesOfDay, timeOfMinutes } from "./paris-time.js";
import { ALL_DISCOUNT_AUDIENCES } from "./pickup-discount-audiences.js";
import {
  type AudiencePickupDiscount,
  pickupDiscountFor,
  type PickupDiscounts,
} from "./pickup-discount-scope.js";

// Le défaut et la règle vivent sans zod, pour le démarrage de la boutique : on
// les réexporte.
export { ALL_DISCOUNT_AUDIENCES, pickupDiscountFor };

/**
 * **Deux cases, une par clientèle.** Né comme « à qui s'applique la remise
 * d'un point » (D2 de `plan-remise-et-livraison-par-clientele.md`) ; la remise
 * a depuis une valeur par clientèle (`pickupDiscountsSchema`), et la forme ne
 * sert plus qu'aux clientèles d'un retrait (`SiteView.pickupAudiences`).
 */
export const pickupDiscountAudiencesSchema = z.object({
  b2b: z.boolean(),
  b2c: z.boolean(),
});
export type PickupDiscountAudiences = z.infer<typeof pickupDiscountAudiencesSchema>;

/**
 * **La remise d'un point pour une clientèle** — sa réduction, son mode de
 * portée et ses règles (plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 * La forme seulement : une règle en double, ou un mode `only` qui n'inclut
 * rien, est refusée par le serveur (`AudienceDiscount`). Le type sans zod est
 * `AudiencePickupDiscount` (`pickup-discount-scope.ts`).
 */
export const audiencePickupDiscountSchema = z
  .object({
    adjustment: cartAdjustmentSchema,
    scope: z.enum(["all_except", "only"]).default("all_except"),
    categories: z
      .array(z.object({ categoryId: z.string().min(1), eligible: z.boolean() }).readonly())
      .readonly()
      .default([]),
    products: z
      .array(z.object({ productId: z.string().min(1), eligible: z.boolean() }).readonly())
      .readonly()
      .default([]),
  })
  .readonly();

// Le type sans zod et le schéma doivent dire la même chose : une divergence
// rougit ici, à la compilation, plutôt qu'au premier point servi.
type Parsed = z.infer<typeof audiencePickupDiscountSchema>;
const SAME_SHAPE: [Parsed, AudiencePickupDiscount] extends [AudiencePickupDiscount, Parsed]
  ? true
  : never = true;
void SAME_SHAPE;

/** Les deux remises d'un point ; `null` = la clientèle n'en reçoit pas. */
export const pickupDiscountsSchema = z.object({
  b2b: audiencePickupDiscountSchema.nullable(),
  b2c: audiencePickupDiscountSchema.nullable(),
});

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

/**
 * Charge de création/édition d'un point de retrait : champs postaux + remise
 * optionnelle (`null` = aucune remise) + heures d'ouverture.
 *
 * `isDefault` en est sorti le 2026-10-15 (Hugo : le site par défaut
 * disparaît) ; un client qui l'envoie encore le voit ignoré, pas refusé.
 */
export const pickupAddressPayloadSchema = billingAddressPayloadSchema.extend({
  /**
   * Une remise par clientèle (V6, 2026-10-22 : remplace `discount` et
   * `discountAudiences`, cassés dans le même déploiement en pré-release).
   */
  discounts: pickupDiscountsSchema.default({ b2b: null, b2c: null }),
  opening: pickupOpeningSchema.default({ publicOpening: null, proPickup: null }),
  /**
   * Le point GPS du lieu (`plan-preparation-de-tournee.md`, Q9, 2026-09-29) :
   * d'ici partira le calcul des distances quand le point est le départ des
   * tournées. `null` l'efface.
   *
   * **Facultatif, et absent = inchangé** : le champ est arrivé sur un contrat
   * déjà servi, et un écran ouvert avant lui ne l'envoie pas. À la création,
   * absent vaut `null` ; à la modification, il laisse le point tel quel —
   * sans quoi un onglet ancien effacerait en silence une position saisie.
   */
  gps: gpsPointSchema.nullable().optional(),
});
export type PickupAddressPayload = z.infer<typeof pickupAddressPayloadSchema>;

/**
 * **Le point de retrait figé sur une commande** — ses champs postaux, et
 * l'identifiant du site qui remet (lot S2, `documentation/sites/sites.md` §7).
 *
 * `siteId` est **facultatif pour de bon** : les commandes passées avant le
 * lot n'en portaient pas. Q-S2 disait « jamais rattrapé » ; révisé par Hugo le
 * 2026-10-23 : la migration `20261023200000_les_retraits_d_avant_s2_rattaches`
 * rattache les seules commandes MORTES dont le snapshot correspond à un site
 * unique, et leur pose `siteIdBackfilled: true` (réversible par ce marqueur ;
 * le schéma, non strict, l'ignore). Les vivantes et les ambiguës restent sans
 * site : tout lecteur doit donc toujours tolérer son absence — le comptoir
 * retombe alors sur le libellé, l'échéance sur l'ancien calcul.
 */
export const pickupSnapshotSchema = billingAddressPayloadSchema.extend({
  siteId: z.string().min(1).optional(),
});
export type PickupSnapshot = z.infer<typeof pickupSnapshotSchema>;

/**
 * La charge d'une **modification** : la même, sauf les remises, **absentes =
 * inchangées**. Avec le défaut de la création, un onglet ouvert avant elles
 * effacerait en silence les remises et leurs règles.
 */
export const pickupAddressUpdatePayloadSchema = pickupAddressPayloadSchema.extend({
  discounts: pickupDiscountsSchema.optional(),
});
export type PickupAddressUpdatePayload = z.infer<typeof pickupAddressUpdatePayloadSchema>;

/** Un point de retrait tel que renvoyé, par ancienneté. */
export interface PickupAddressView {
  readonly id: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  /**
   * La remise appliquée au panier en cas de retrait ici, une par clientèle —
   * avec ce qu'elle couvre (`pickupDiscountCovers`).
   */
  readonly discounts: PickupDiscounts;
  /**
   * **À qui le site remet en retrait** (Hugo, 2026-10-15) — un site peut être
   * réservé aux pros ou aux particuliers. Toujours rendu par le serveur ;
   * facultatif dans le TYPE, comme `gps`, pour les vues construites à la main
   * avant lui : absent = ouvert aux deux (`pickupOpenTo`).
   */
  readonly pickupAudiences?: PickupDiscountAudiences | undefined;
  /** Quand on peut venir — cf. {@link pickupOpeningSchema}. */
  readonly opening: PickupOpening;
  /**
   * Le point GPS du lieu, `null` s'il n'est pas saisi. Toujours rendu par le
   * serveur depuis le 2026-09-29 ; facultatif dans le TYPE pour que les vues
   * construites à la main avant lui (fixtures des fronts) restent valides —
   * un absent se lit comme `null`.
   */
  readonly gps?: GpsPoint | null | undefined;
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
