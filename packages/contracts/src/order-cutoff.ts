import { z } from "zod";

import { weekdaySchema, type Weekday } from "./address.js";

/**
 * **Heures limites de commande** — jusqu'à quand on peut commander (ou déposer un
 * avenant) pour un acheminement donné.
 *
 * ## Pourquoi une table et pas un champ de réglage
 *
 * Parce que la limite n'est pas *une* valeur : un labo qui enfourne à 4 h et un
 * autre à 6 h n'ont pas la même, et le samedi ne ressemble pas au mardi. Une
 * colonne `cutoff_time` sur les réglages aurait forcé une migration à chaque
 * nuance. Ici, **une règle = une ligne** : ouvrir un second labo ou décaler le
 * dimanche, c'est de la saisie, pas du déploiement.
 *
 * ## Ce qu'une règle dit
 *
 * « Pour tel point de retrait, tel jour de la semaine, il faut avoir commandé
 * **N jours avant à telle heure** ». Les deux morceaux comptent : « 18 h » seul
 * est ambigu — 18 h de quel jour ? `daysBefore` lève l'ambiguïté en comptant
 * depuis la **date d'acheminement demandée**, jamais depuis celle du dépôt.
 * Commander mardi pour jeudi ne se juge pas à l'heure de mardi.
 *
 * ## Comment on choisit la règle qui s'applique
 *
 * La **plus spécifique gagne** (cf. {@link resolveOrderCutoff}), du plus précis
 * au plus général. Aucune règle ⇒ aucune limite : tout passe. C'est le défaut
 * volontaire — une plateforme qui n'a rien configuré ne doit pas refuser des
 * commandes au nom d'une limite que personne n'a posée.
 */

/**
 * Les jours dans l'ordre de `Date.getDay()` — l'index EST le jour JS. Sert à
 * traduire une date en {@link Weekday} sans table de correspondance dispersée.
 */
const WEEKDAY_BY_JS_DAY: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Le jour de la semaine d'une date ISO (`YYYY-MM-DD`), en **heure locale**.
 *
 * On réutilise le {@link Weekday} des créneaux de livraison plutôt qu'un entier :
 * deux représentations du même jour dans un seul contrat, c'est la garantie
 * qu'un jour finira décalé d'une unité quelque part.
 */
export function weekdayOfDate(isoDate: string): Weekday {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return WEEKDAY_BY_JS_DAY[new Date(year, month - 1, day).getDay()] ?? "mon";
}

/** `HH:MM` en 24 h — l'heure locale du laboratoire, pas un instant UTC. */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM");

/** Charge de création / édition d'une règle d'heure limite. */
export const orderCutoffPayloadSchema = z.object({
  /**
   * Le point de retrait visé, ou `null` = **règle par défaut** de la plateforme
   * (elle s'applique à tout ce qu'aucune règle plus précise ne couvre).
   */
  pickupAddressId: z.string().trim().min(1).nullable().default(null),
  /** Le jour d'acheminement visé, ou `null` = **tous les jours**. */
  weekday: weekdaySchema.nullable().default(null),
  /** Combien de jours **avant** l'acheminement la limite tombe. `0` = le jour même. */
  daysBefore: z.number().int().min(0).max(14).default(1),
  /** L'heure de la limite, ce jour-là. */
  time: clockTimeSchema,
});
export type OrderCutoffPayload = z.infer<typeof orderCutoffPayloadSchema>;

/** Une règle telle que renvoyée (la plus spécifique en tête). */
export interface OrderCutoffView {
  readonly id: string;
  readonly pickupAddressId: string | null;
  /** Nom du point, résolu pour l'affichage. `null` quand la règle est le défaut. */
  readonly pickupLabel: string | null;
  readonly weekday: Weekday | null;
  readonly daysBefore: number;
  readonly time: string;
}

/** Réponse de création d'une règle. */
export interface CreatedOrderCutoffResponse {
  readonly id: string;
}

/**
 * La règle qui s'applique à un acheminement, ou `null` s'il n'y en a aucune.
 *
 * **La plus spécifique gagne**, dans cet ordre :
 *
 * 1. ce point de retrait, ce jour précis ;
 * 2. ce point de retrait, tous les jours ;
 * 3. le défaut plateforme, ce jour précis ;
 * 4. le défaut plateforme, tous les jours.
 *
 * Fonction **pure**, exportée par le contrat parce que les deux côtés en ont
 * besoin : le serveur pour trancher, l'écran de réglages pour montrer laquelle
 * s'appliquerait — et deux implémentations de cette priorité finiraient par
 * diverger sur un cas limite.
 */
export function resolveOrderCutoff(
  rules: readonly OrderCutoffView[],
  pickupAddressId: string | null,
  weekday: Weekday,
): OrderCutoffView | null {
  const matches = (rule: OrderCutoffView, point: boolean, day: boolean): boolean =>
    (point ? rule.pickupAddressId === pickupAddressId : rule.pickupAddressId === null) &&
    (day ? rule.weekday === weekday : rule.weekday === null);

  // `pickupAddressId === null` (livraison, ou point inconnu) ne peut pas matcher
  // une règle de point : les deux premiers passages retombent alors sur le défaut,
  // ce qui est exactement le comportement voulu.
  return (
    rules.find((rule) => matches(rule, true, true)) ??
    rules.find((rule) => matches(rule, true, false)) ??
    rules.find((rule) => matches(rule, false, true)) ??
    rules.find((rule) => matches(rule, false, false)) ??
    null
  );
}

/**
 * L'instant limite pour un acheminement demandé le jour `fulfillmentDate`.
 *
 * Rend une `Date` construite en **heure locale** : la limite est celle du four,
 * pas celle d'UTC. Un `daysBefore` de 1 sur `2026-08-12` à `18:00` donne le
 * 11 août à 18 h.
 */
export function orderCutoffInstant(rule: OrderCutoffView, fulfillmentDate: string): Date {
  const [year = 0, month = 1, day = 1] = fulfillmentDate.split("-").map(Number);
  const [hours = 0, minutes = 0] = rule.time.split(":").map(Number);
  return new Date(year, month - 1, day - rule.daysBefore, hours, minutes, 0, 0);
}
