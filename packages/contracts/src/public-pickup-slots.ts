import { z } from "zod";

import { weekdaySchema, type Weekday } from "./address.js";
import {
  addMinutes,
  localToInstant,
  minutesOfDay,
  timeOfMinutes,
  weekdayOf,
} from "./paris-time.js";

/**
 * **Les créneaux de retrait PUBLIC d'un point** — ce que choisit un visiteur.
 *
 * 🔴 Rien ici ne touche `PickupOpening` (`pickup.ts`), qui porte les heures
 * **pro** d'un comptoir. Les deux structures cohabitent à dessein : le public a
 * besoin d'un badge, d'une capacité de service et d'un pas de découpe réglable,
 * le pro n'a besoin d'aucun des trois. Plan
 * `documentation/b2b/plan-creneaux-de-retrait.md`, §3.
 *
 * ⚠️ Le piège de nommage, tenu ici : `publicOpening` est l'**amplitude**
 * d'ouverture au public d'un point ; ce fichier parle de **créneaux**
 * réservables. Jamais « heures ».
 *
 * Les créneaux sont **dérivés, jamais stockés** (D1) : deux petites listes — des
 * règles et des fermetures — et une fonction pure. Rien d'enregistré ne peut
 * donc diverger de l'horaire réel.
 */

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const timeSchema = z.string().regex(TIME_HHMM, "heure attendue au format HH:MM");
const daySchema = z.string().regex(DAY_PATTERN, "jour attendu au format AAAA-MM-JJ");

/**
 * Une **règle** : une plage homogène d'un point, découpée à pas constant (D2).
 *
 * `weekday` nul vaut « tous les jours » ; `badge` nul vaut « pas de pastille »
 * (la chaîne vide est refusée par le domaine, elle dirait une troisième chose) ;
 * `serviceCapacity` nulle vaut **aucune limite** — c'est le défaut voulu, on ne
 * refuse jamais un client (D3).
 */
export const publicPickupSlotRulePayloadSchema = z
  .object({
    weekday: weekdaySchema.nullable().default(null),
    startTime: timeSchema,
    endTime: timeSchema,
    slotMinutes: z.number().int().positive(),
    badge: z.string().nullable().default(null),
    serviceCapacity: z.number().int().positive().nullable().default(null),
  })
  .refine((rule) => rule.startTime < rule.endTime, {
    path: ["endTime"],
    message: "la fin de la plage doit suivre le début",
  });
export type PublicPickupSlotRulePayload = z.infer<typeof publicPickupSlotRulePayloadSchema>;

/** Une règle telle que rendue par l'API : elle porte son identifiant. */
export interface PublicPickupSlotRuleView extends PublicPickupSlotRulePayload {
  readonly id: string;
}

/**
 * Une **fermeture datée** (D4) : un intervalle de jours, et non un jour unique —
 * une semaine de congés est une ligne, pas sept. Bornes horaires facultatives :
 * absentes, elles ferment la journée entière.
 */
export const publicPickupClosurePayloadSchema = z
  .object({
    fromDay: daySchema,
    toDay: daySchema,
    startTime: timeSchema.nullable().default(null),
    endTime: timeSchema.nullable().default(null),
    reason: z.string().default(""),
  })
  .refine((closure) => closure.fromDay <= closure.toDay, {
    path: ["toDay"],
    message: "le dernier jour doit suivre le premier",
  })
  .refine((closure) => (closure.startTime === null) === (closure.endTime === null), {
    path: ["endTime"],
    message: "une fermeture porte ses deux bornes, ou aucune",
  })
  .refine(
    (closure) =>
      closure.startTime === null || closure.endTime === null || closure.startTime < closure.endTime,
    { path: ["endTime"], message: "la fin de la fermeture doit suivre le début" },
  );
export type PublicPickupClosurePayload = z.infer<typeof publicPickupClosurePayloadSchema>;

/** Une fermeture telle que rendue par l'API. */
export interface PublicPickupClosureView extends PublicPickupClosurePayload {
  readonly id: string;
}

/**
 * L'horaire public d'un point, **en bloc**. Un `PUT` idempotent plutôt qu'un
 * CRUD à trois verbes : l'écran édite une grille et l'enregistre, et le refus de
 * chevauchement se juge sur l'ensemble.
 */
export const publicPickupSchedulePayloadSchema = z.object({
  rules: z.array(publicPickupSlotRulePayloadSchema).default([]),
  closures: z.array(publicPickupClosurePayloadSchema).default([]),
});
export type PublicPickupSchedulePayload = z.infer<typeof publicPickupSchedulePayloadSchema>;

/** L'horaire public tel que rendu par l'API (règles et fermetures identifiées). */
export interface PublicPickupScheduleView {
  readonly rules: readonly PublicPickupSlotRuleView[];
  readonly closures: readonly PublicPickupClosureView[];
}

/**
 * Ce qui est **déjà pris** sur une heure de la journée, par créneau.
 *
 * Un compte à N, et non une exclusivité à 1 : `slotsFor` (rendez-vous) écarte un
 * créneau dès qu'il chevauche un rendez-vous, ce qui n'est pas la propriété dont
 * un comptoir a besoin (plan §2.2).
 */
export interface PublicPickupSlotTaken {
  /** L'heure locale de début du créneau, `HH:MM`. */
  readonly time: string;
  readonly count: number;
}

/**
 * Un créneau public offert à un visiteur.
 *
 * 🔴 Un créneau plein reste **visible et fermé** (D3) : on ne fait pas
 * disparaître une heure, on dit qu'elle est complète et on nomme la suivante
 * encore ouverte. « Complet, il reste de la place à 13 h 15 » est une
 * orientation ; une absence serait un refus muet.
 */
export interface PublicPickupSlot {
  /** Instant UTC — la vérité. */
  readonly startAt: string;
  readonly endAt: string;
  /** La lecture locale (Europe/Paris), calculée côté serveur. */
  readonly day: string;
  readonly time: string;
  /** L'argument commercial du vendeur pour cette heure-là, ou `null` (§2.4). */
  readonly badge: string | null;
  /** `null` = aucune limite : ce créneau ne refuse personne. */
  readonly serviceCapacity: number | null;
  readonly taken: number;
  /** Ouvert = il reste de la place. Fermé, le créneau est rendu quand même. */
  readonly open: boolean;
  /** Quand ce créneau est fermé : la prochaine heure encore ouverte, ou `null`. */
  readonly nextOpenTime: string | null;
}

/** Les clés de jour dans l'ordre de `weekdayOf` (0 = dimanche). */
const WEEKDAY_KEYS: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Un intervalle fermé en minutes depuis minuit. */
interface ClosedInterval {
  readonly start: number;
  readonly end: number;
}

/**
 * **Les créneaux publics d'UNE journée**, dérivés des règles du point.
 *
 * Fonction **pure** : `now` est injecté, jamais lu au mur — c'est elle que
 * liront l'accueil public et l'aperçu de l'écran d'administration, et ils ne
 * peuvent donc pas afficher deux vérités.
 *
 * Trois propriétés qui ne se devinent pas à la lecture de la signature :
 * - une **fermeture prime** sur toute règle (D4) ; sans bornes, elle vide la
 *   journée, y compris les plages qu'une autre règle y ouvrait ;
 * - un créneau **déjà commencé** n'est plus offert — d'où `now` ;
 * - une heure locale **inexistante** (passage à l'heure d'été) est sautée
 *   plutôt que décalée en silence, comme le fait `slotsFor`.
 */
export function publicPickupSlotsFor(
  day: string,
  rules: readonly PublicPickupSlotRuleView[],
  closures: readonly PublicPickupClosureView[],
  taken: readonly PublicPickupSlotTaken[],
  now: Date,
): readonly PublicPickupSlot[] {
  const closed = closedIntervalsOf(day, closures);
  if (closed === null) {
    return [];
  }
  const counts = new Map(taken.map((entry) => [entry.time, entry.count]));
  const slots: PublicPickupSlot[] = [];
  for (const rule of rules.filter((candidate) => appliesOn(candidate, day))) {
    collectRuleSlots(day, rule, closed, counts, now, slots);
  }
  return withNextOpen(slots.sort((a, b) => a.time.localeCompare(b.time)));
}

/** La règle vise-t-elle ce jour ? `weekday` nul = tous les jours. */
function appliesOn(rule: PublicPickupSlotRuleView, day: string): boolean {
  return rule.weekday === null || rule.weekday === WEEKDAY_KEYS[weekdayOf(day)];
}

/**
 * Les plages fermées de la journée, ou `null` quand la journée entière est
 * fermée (une fermeture sans bornes).
 */
function closedIntervalsOf(
  day: string,
  closures: readonly PublicPickupClosureView[],
): ClosedInterval[] | null {
  const ofDay = closures.filter((closure) => closure.fromDay <= day && day <= closure.toDay);
  if (ofDay.some((closure) => closure.startTime === null)) {
    return null;
  }
  return ofDay.map((closure) => ({
    start: minutesOfDay(closure.startTime ?? "00:00"),
    end: minutesOfDay(closure.endTime ?? "00:00"),
  }));
}

/**
 * Découpe une règle à SON pas, depuis SON début.
 *
 * La grille reste celle de la règle même quand une fermeture la coupe : ce sont
 * les créneaux touchés qui disparaissent, pas la grille qui se décale. Décaler
 * changerait les heures offertes de toute la fin de plage pour une fermeture
 * d'un quart d'heure.
 *
 * Un pas qui ne divise pas la plage laisse le reste **inutilisé** : `07:00–08:00`
 * par 25 min rend deux créneaux, pas un troisième qui déborderait la fermeture.
 */
function collectRuleSlots(
  day: string,
  rule: PublicPickupSlotRuleView,
  closed: readonly ClosedInterval[],
  counts: ReadonlyMap<string, number>,
  now: Date,
  out: PublicPickupSlot[],
): void {
  const end = minutesOfDay(rule.endTime);
  for (
    let start = minutesOfDay(rule.startTime);
    start + rule.slotMinutes <= end;
    start += rule.slotMinutes
  ) {
    const slotEnd = start + rule.slotMinutes;
    if (closed.some((hole) => start < hole.end && hole.start < slotEnd)) {
      continue;
    }
    const time = timeOfMinutes(start);
    const startAt = localToInstant(day, time);
    // `null` = heure locale inexistante (passage à l'heure d'été) : on saute.
    if (startAt === null || startAt.getTime() <= now.getTime()) {
      continue;
    }
    const count = counts.get(time) ?? 0;
    out.push({
      startAt: startAt.toISOString(),
      endAt: addMinutes(startAt, rule.slotMinutes).toISOString(),
      day,
      time,
      badge: rule.badge,
      serviceCapacity: rule.serviceCapacity,
      taken: count,
      open: rule.serviceCapacity === null || count < rule.serviceCapacity,
      nextOpenTime: null,
    });
  }
}

/**
 * Renseigne, sur chaque créneau fermé, la prochaine heure encore ouverte.
 *
 * Une passe à rebours : chaque créneau regarde ce qui le suit, déjà calculé. Un
 * créneau ouvert ne porte rien — la question ne se pose pas pour lui.
 */
function withNextOpen(slots: readonly PublicPickupSlot[]): readonly PublicPickupSlot[] {
  const filled: PublicPickupSlot[] = [];
  let nextOpen: string | null = null;
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index];
    if (slot === undefined) {
      continue;
    }
    filled.unshift({ ...slot, nextOpenTime: slot.open ? null : nextOpen });
    if (slot.open) {
      nextOpen = slot.time;
    }
  }
  return filled;
}
