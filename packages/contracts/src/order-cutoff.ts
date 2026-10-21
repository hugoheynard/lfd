import { z } from "zod";

import { weekdaySchema, type Weekday } from "./address.js";
import { addDays, instantToLocal, localToInstant, weekdayOf } from "./paris-time.js";

/**
 * **Heures limites de commande** — jusqu'à quand on peut commander pour une
 * journée de service.
 *
 * ## Une seule règle : la générale (Hugo, 2026-10-21)
 *
 * La table a porté une règle par point de retrait × jour de semaine, la plus
 * spécifique l'emportant. Décision de Hugo du 2026-10-21
 * (`documentation/limites-de-commande/schema-des-reglages.md` §4, point 4) :
 * ces règles sont **retirées**. Il ne reste que la règle générale — ni point,
 * ni jour —, « demain se commande avant l'heure limite » (§0). La base le
 * tient (CHECK `order_cutoffs_general_only`, migration du 2026-10-21) ; les
 * fonctions ci-dessous ignorent quand même une ligne à point ou à jour qu'on
 * leur passerait, pour qu'aucune ne revienne s'appliquer par la lecture.
 *
 * ## Ce qu'une règle dit
 *
 * « Il faut avoir commandé **N jours avant à telle heure** ». Les deux morceaux
 * comptent : « 18 h » seul est ambigu — 18 h de quel jour ? `daysBefore` lève
 * l'ambiguïté en comptant depuis la **date d'acheminement demandée**, jamais
 * depuis celle du dépôt. Commander mardi pour jeudi ne se juge pas à l'heure
 * de mardi.
 *
 * Aucune règle ⇒ aucune limite : tout passe. C'est le défaut volontaire — une
 * plateforme qui n'a rien configuré ne doit pas refuser des commandes au nom
 * d'une limite que personne n'a posée.
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

/**
 * Charge de réglage de **la règle générale** (`PUT admin/order-cutoffs/general`).
 *
 * `pickupAddressId` et `weekday` restent dans la FORME, à `null` par défaut :
 * une charge qui en porte un n'est pas avalée en silence (Zod retirerait une
 * clé inconnue sans rien dire), elle est **refusée par le serveur**, avec un
 * message qui dit que ces règles n'existent plus (2026-10-21).
 */
export const orderCutoffPayloadSchema = z.object({
  /** Toujours `null` depuis le 2026-10-21 ; toute autre valeur est refusée. */
  pickupAddressId: z.string().trim().min(1).nullable().default(null),
  /** Toujours `null` depuis le 2026-10-21 ; toute autre valeur est refusée. */
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

/**
 * Une règle telle que renvoyée. Depuis le 2026-10-21, seule la générale est
 * servie : `pickupAddressId`, `pickupLabel` et `weekday` y valent `null`.
 */
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

/**
 * Réponse de `GET admin/order-cutoffs/general` : la règle générale, ou `null`
 * tant que personne ne l'a posée. Enveloppée pour qu'une absence se lise comme
 * une donnée, pas comme un corps vide.
 */
export interface GeneralOrderCutoffResponse {
  readonly rule: OrderCutoffView | null;
}

/**
 * **La règle générale** — ni point de retrait, ni jour de semaine —, ou `null`
 * s'il n'y en a pas.
 *
 * Jusqu'au 2026-10-21, « la plus spécifique gagnait » entre quatre rangs
 * (point × jour, point, jour, défaut). Les règles par point et par jour sont
 * retirées (schéma des réglages §4, point 4) : une ligne résiduelle qui en
 * porterait est **ignorée**, ici, pour tous les lecteurs à la fois — passation,
 * boutique, fournil, relance, vitrine.
 *
 * Fonction **pure**, exportée par le contrat parce que le serveur et les écrans
 * en ont besoin : deux implémentations finiraient par diverger.
 */
export function resolveOrderCutoff(rules: readonly OrderCutoffView[]): OrderCutoffView | null {
  return rules.find((rule) => rule.pickupAddressId === null && rule.weekday === null) ?? null;
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
  return orderLimitInstant(rule, fulfillmentDate);
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

/**
 * **Une limite résolue**, d'où qu'elle vienne : la règle du commerce, ou celle
 * que le référentiel a résolue pour l'article.
 *
 * Le type existe pour que la décision cesse de dépendre de la SOURCE. Depuis que
 * les articles portent leur propre limite, deux chemins produisent la même
 * chose ; les faire décider chacun de leur côté aurait garanti qu'ils divergent
 * sur une borne.
 */
export interface OrderLimitSpec {
  readonly daysBefore: number;
  readonly time: string;
  readonly graceMinutes: number;
}

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
  fulfillmentDate: string,
  now: Date,
): OrderCutoffDecision {
  const rule = resolveOrderCutoff(rules);
  if (rule === null) {
    return NOTHING_TO_OPPOSE;
  }
  return { ...decideOrderLimit(rule, fulfillmentDate, now), rule };
}

/**
 * La même décision, à partir d'une **limite déjà résolue** — celle que le
 * référentiel envoie avec l'article, ou celle qu'une règle du commerce produit.
 *
 * C'est ici que vivent les trois états et leurs bornes ; `decideOrderCutoff` ne
 * fait plus que choisir la règle avant d'appeler cette fonction. Deux
 * implémentations auraient fini par diverger sur une borne, et l'écart n'aurait
 * concerné qu'une des deux sources — donc qu'une partie du catalogue.
 *
 * `limit` à `null` = rien à opposer, et la commande passe.
 */
export function decideOrderLimit(
  limit: OrderLimitSpec | null,
  fulfillmentDate: string,
  now: Date,
): OrderCutoffDecision {
  if (limit === null) {
    return NOTHING_TO_OPPOSE;
  }
  const at0 = orderLimitInstant(limit, fulfillmentDate);
  if (at0 === null) {
    return NOTHING_TO_OPPOSE;
  }
  const graceEnd = new Date(at0.getTime() + limit.graceMinutes * MINUTE_MS);
  const at = now.getTime();
  const status: OrderCutoffStatus =
    at <= at0.getTime() ? "open" : at <= graceEnd.getTime() ? "grace" : "closed";
  return { status, rule: null, limit: at0, graceEnd };
}

/** L'instant limite d'une limite résolue. Même conversion que {@link orderCutoffInstant}. */
export function orderLimitInstant(limit: OrderLimitSpec, fulfillmentDate: string): Date | null {
  return localToInstant(addDays(fulfillmentDate, -limit.daysBefore), limit.time);
}

/** L'horizon de recherche de la prochaine journée demandable, en jours. */
export const NEXT_FULFILLMENT_HORIZON_DAYS = 14;

const NO_UNAVAILABLE_DAYS: ReadonlySet<string> = new Set();

/**
 * **La prochaine journée de production encore demandable** — la même pour
 * tous les points depuis que seule la règle générale existe (2026-10-21).
 *
 * ## Pourquoi elle est calculée SERVEUR
 *
 * 🔴 L'écran de commande posait « demain » à partir de `new Date()` — l'horloge
 * du **navigateur du client**. Un poste mal réglé, un fuseau de vacances, et la
 * journée demandée n'était pas celle du fournil. Pire : « demain » ignorait
 * l'heure limite, donc proposait une journée que la commande allait refuser
 * après coup, sans que rien ne l'ait annoncé.
 *
 * `now` vient donc du `Clock`, comme partout où une limite se compare à
 * l'horloge.
 *
 * ## Ce que cette date est, et ce qu'elle n'est PAS
 *
 * ⚠️ Une **proposition d'ouverture**, jamais une autorisation. Elle ne connaît
 * que les règles du commerce ; un article peut porter **sa** limite, et c'est
 * `ensureWithinOrderCutoff` — au moment de poser la commande, panier en main —
 * qui tranche. Les deux ne peuvent pas se contredire en silence : celle-ci ne
 * fait qu'ouvrir un écran, l'autre seule refuse.
 *
 * ## Les journées qu'un réglage ferme
 *
 * `unavailableDays` (lot O3 de `plan-reglages-commandes.md`, 2026-10-14) : les
 * journées dont le plan de production est arrêté, et aujourd'hui quand le
 * réglage « jour même » ne l'autorise pas. Elles sont sautées, quelle que soit
 * l'heure limite. Le serveur les décide ; aucune n'est codée ici.
 *
 * @returns `AAAA-MM-JJ`, ou `null` si aucune journée de l'horizon n'est ouverte.
 * Un `null` se montre (« aucune journée disponible ») ; il ne se remplace pas
 * par un défaut, sinon on retombe sur le « demain » qu'on vient de retirer.
 */
export function nextFulfillmentDay(
  rules: readonly OrderCutoffView[],
  now: Date,
  horizonDays = NEXT_FULFILLMENT_HORIZON_DAYS,
  unavailableDays: ReadonlySet<string> = NO_UNAVAILABLE_DAYS,
): string | null {
  const today = instantToLocal(now).day;
  for (let ahead = 0; ahead <= horizonDays; ahead += 1) {
    const day = addDays(today, ahead);
    if (unavailableDays.has(day)) {
      continue;
    }
    if (decideOrderCutoff(rules, day, now).status === "open") {
      return day;
    }
  }
  return null;
}

/**
 * Ce que le fil rend : une journée par destination de service.
 *
 * L'entrée `pickupAddressId: null` est **toujours** présente — c'est la règle
 * par défaut, donc la journée de la livraison, qui ne vise aucun point.
 */
export interface FulfillmentDayView {
  /** Le point de retrait visé, ou `null` = le défaut (livraison comprise). */
  readonly pickupAddressId: string | null;
  /** La prochaine journée demandable, ou `null` — aucune dans l'horizon. */
  readonly date: string | null;
  /**
   * **Jusqu'à quand** on peut commander pour {@link date} — l'instant limite en
   * ISO 8601, ou `null` : aucune journée, aucune règle en vigueur, ou heure
   * inexistante ce jour-là (cf. {@link orderCutoffInstant}).
   *
   * Calculé par la même règle que {@link decideOrderCutoff}, **grâce non
   * comprise** : la boutique annonce l'heure annoncée, pas le rattrapage qu'un
   * humain peut accorder après elle (2026-10-21, « plus que … pour commander »).
   *
   * Comme {@link date}, une annonce et jamais une autorisation : un article peut
   * porter sa propre limite, et la passation reste seule à refuser.
   */
  readonly orderUntil: string | null;
}

/**
 * L'instant limite ANNONCÉ pour cette journée — celui que
 * {@link FulfillmentDayView.orderUntil} sert. Même résolution que
 * {@link decideOrderCutoff} ; la grâce n'y entre pas.
 */
export function announcedOrderUntil(
  rules: readonly OrderCutoffView[],
  fulfillmentDate: string | null,
): string | null {
  if (fulfillmentDate === null) {
    return null;
  }
  const rule = resolveOrderCutoff(rules);
  return rule === null ? null : (orderCutoffInstant(rule, fulfillmentDate)?.toISOString() ?? null);
}
