import { z } from "zod";

import { weekdaySchema, type Weekday } from "./address.js";
import { addDays, localToInstant, weekdayOf } from "./paris-time.js";

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
 * Les jours dans l'ordre de `Date.getUTCDay()` — l'index EST le jour JS. Sert à
 * traduire une date en {@link Weekday} sans table de correspondance dispersée.
 */
const WEEKDAY_BY_JS_DAY: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Le jour de la semaine d'une date ISO (`YYYY-MM-DD`).
 *
 * On réutilise le {@link Weekday} des créneaux de livraison plutôt qu'un entier :
 * deux représentations du même jour dans un seul contrat, c'est la garantie
 * qu'un jour finira décalé d'une unité quelque part.
 *
 * ⚠️ Passait par `new Date(y, m, d).getDay()`, donc par le fuseau du **process**.
 * Une date nue n'a pourtant pas de fuseau : `weekdayOf` la lit en UTC, ce qui la
 * rend identique sur le poste d'un développeur et dans un conteneur.
 */
export function weekdayOfDate(isoDate: string): Weekday {
  return WEEKDAY_BY_JS_DAY[weekdayOf(isoDate)] ?? "mon";
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
  /**
   * Le **rattrapage** accordé après la limite, en minutes. `0` = aucun.
   *
   * Une **durée** et non une seconde heure : `limite + grâce` suit
   * automatiquement chaque rang de l'échelle, alors qu'une heure absolue aurait
   * dû être ressaisie sur chacun — et se serait retrouvée, un jour, avant sa
   * propre limite.
   *
   * Plafonnée à 12 h. Au-delà, ce n'est plus un rattrapage : c'est une autre
   * heure limite, et elle doit se saisir comme telle pour rester lisible par
   * qui lit l'écran de réglages.
   */
  graceMinutes: z.number().int().min(0).max(720).default(0),
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
  /** Le rattrapage après la limite, en minutes. `0` = aucun. */
  readonly graceMinutes: number;
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
 * L'heure de la règle est une heure de **pendule d'Europe/Paris** — celle du
 * four —, jamais un instant UTC. Un `daysBefore` de 1 sur `2026-08-12` à `18:00`
 * donne le 11 août à 18 h **à Paris**, soit 16 h UTC en été et 17 h en hiver.
 *
 * 🔴 **Cette fonction construisait son instant avec `new Date(y, m, d, h, min)`**,
 * c'est-à-dire dans le fuseau du **process**. Le conteneur tourne en UTC : une
 * limite saisie à 18 h y valait 20 h à Paris l'été, 19 h l'hiver — un décalage
 * qui change avec la saison, sur du code inchangé. Il est resté invisible tant
 * que rien n'appliquait la règle.
 *
 * @returns `null` quand cette heure locale **n'existe pas** ce jour-là — l'heure
 * sautée du passage à l'heure d'été. Un instant faux rendu sans le dire serait
 * pire ; l'appelant décide, et {@link isPastOrderCutoff} choisit de ne pas
 * refuser (une heure, une nuit par an, et seulement pour une limite réglée entre
 * 2 h et 3 h du matin).
 */
export function orderCutoffInstant(rule: OrderCutoffView, fulfillmentDate: string): Date | null {
  return localToInstant(addDays(fulfillmentDate, -rule.daysBefore), rule.time);
}

/**
 * Les **trois états** d'une demande d'acheminement, dans l'ordre du temps.
 *
 * Un binaire passe/refuse ne suffit pas : entre la limite et la fin de grâce, la
 * commande n'est ni acceptable en libre-service ni définitivement perdue — elle
 * demande qu'un humain la reprenne. Confondre cet état avec `closed` ferait
 * répondre « trop tard » à quelqu'un qu'un coup de fil sauverait ; le confondre
 * avec `open` ferait passer en silence ce qui doit être décidé.
 */
export type OrderCutoffStatus = "open" | "grace" | "closed";

/** Ce que la règle applicable dit d'un acheminement, et de quoi le raconter. */
export interface OrderCutoffDecision {
  readonly status: OrderCutoffStatus;
  /** La règle retenue, ou `null` s'il n'y en a aucune (tout passe). */
  readonly rule: OrderCutoffView | null;
  /** L'instant limite, ou `null` : aucune règle, ou heure inexistante ce jour-là. */
  readonly limit: Date | null;
  /** L'instant où la grâce se ferme. Égal à `limit` quand il n'y a pas de grâce. */
  readonly graceEnd: Date | null;
}

/** Une décision qui n'oppose rien — aucune règle, ou rien de calculable. */
const NOTHING_TO_OPPOSE: OrderCutoffDecision = {
  status: "open",
  rule: null,
  limit: null,
  graceEnd: null,
};

const MINUTE_MS = 60 * 1000;

/**
 * **Où en est** une demande d'acheminement le jour `fulfillmentDate` ?
 *
 * Le seul endroit qui compare la limite à l'horloge. `now` est **fourni** — il
 * vient du `Clock` côté serveur — pour que la décision reste déterministe et
 * testable, et pour qu'un fuseau de navigateur ne s'invite pas dans un refus.
 *
 * Rend `open` dans les deux cas où il n'y a rien à opposer : aucune règle ne
 * couvre cet acheminement, ou l'heure de la règle n'existe pas ce jour-là
 * (cf. {@link orderCutoffInstant}). Refuser sur l'un ou l'autre bloquerait une
 * commande légitime au nom d'un réglage absent ou d'un artefact de calendrier.
 *
 * **Les deux bornes sont incluses** : à la seconde de la limite on est encore
 * `open`, à la seconde de la fin de grâce encore `grace`. Une limite affichée
 * « 18 h » doit accepter 18 h 00 min 00 s — c'est ce que lit celui qui commande.
 */
export function decideOrderCutoff(
  rules: readonly OrderCutoffView[],
  pickupAddressId: string | null,
  fulfillmentDate: string,
  now: Date,
): OrderCutoffDecision {
  const rule = resolveOrderCutoff(rules, pickupAddressId, weekdayOfDate(fulfillmentDate));
  if (rule === null) {
    return NOTHING_TO_OPPOSE;
  }
  const limit = orderCutoffInstant(rule, fulfillmentDate);
  if (limit === null) {
    return { ...NOTHING_TO_OPPOSE, rule };
  }
  const graceEnd = new Date(limit.getTime() + rule.graceMinutes * MINUTE_MS);
  const at = now.getTime();
  const status: OrderCutoffStatus =
    at <= limit.getTime() ? "open" : at <= graceEnd.getTime() ? "grace" : "closed";
  return { status, rule, limit, graceEnd };
}
