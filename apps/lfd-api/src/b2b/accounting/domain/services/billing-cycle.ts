import { instantToLocal, localToInstant } from "@lfd/contracts";

import { BillingCycleBoundaryError } from "../errors/accounting-errors.js";

/**
 * **Le cycle de prélèvement** — la fenêtre dont on somme les commandes.
 *
 * ## Il va d'une clôture à la suivante, PAS d'un 1er à l'autre
 *
 * C'est la seule borne qui survive à une clôture anticipée : bornée par le
 * calendrier, une commande passée après une clôture du 20 se retrouverait dans
 * deux cycles ou dans aucun. Bornée par la clôture précédente, elle est dans le
 * suivant, sans cas particulier à écrire.
 *
 * Conséquence assumée : **le cycle n'est pas calendaire**, et la clôture au 1er
 * n'est qu'une valeur par défaut. La clôture anticipée cesse d'être une
 * exception — c'est le cas général, et le calendrier le cas dégénéré.
 *
 * ## 🔴 Ni minuit UTC, ni `new Date()`
 *
 * « Le 1er à 00h00 » est un jour **local**. Poser la borne à minuit UTC ferait
 * basculer une à deux heures de commandes dans le mauvais cycle, et
 * différemment selon la saison — l'écart entre Paris et UTC vaut une heure en
 * hiver, deux en été. La conversion passe donc par `localToInstant`, qui vérifie
 * sa propre réponse plutôt que de rendre un instant faux.
 *
 * ⚠️ `lint:business-day` **ne protège pas** ce fichier : sa portée s'arrête à
 * quatre dossiers de tarification. La discipline est ici, dans le code et ce
 * commentaire (vérifié le 2026-09-10 dans `dev-toolbox/gates/business-day.mjs`).
 *
 * ## Ce module est PUR
 *
 * Il ne lit pas l'horloge : l'instant lui est donné. C'est ce qui le rend
 * testable sur un passage à l'heure d'été sans attendre mars.
 */

/** L'heure à laquelle un cycle se ferme, dans le fuseau des affaires. */
export const CYCLE_CLOSING_TIME = "00:00";

export interface BillingCycle {
  /** Inclusif : une commande passée exactement à cet instant est dans ce cycle. */
  readonly startsAt: Date;
  /** **Exclusif** : une commande passée à cet instant appartient au SUIVANT. */
  readonly closesAt: Date;
}

/**
 * Le cycle qui contient `now`.
 *
 * `previousClosure` est la dernière clôture **enregistrée**, ou `null` tant
 * qu'aucune ne l'est. Ce `null` n'est pas un cas dégradé : c'est l'état d'un
 * système qui n'a encore rien clôturé, et la borne basse se rabat alors sur le
 * 1er du mois courant — le cycle qu'on aurait eu si le calendrier décidait.
 *
 * Le paramètre existe **avant** la persistance des clôtures, à dessein : le jour
 * où elles existent, aucun appelant ne change.
 *
 * @throws {BillingCycleBoundaryError} l'heure de clôture n'existe pas ce jour-là.
 */
export function cycleAt(now: Date, previousClosure: Date | null): BillingCycle {
  const { day } = instantToLocal(now);
  const closesAt = firstOfMonthAfter(day);

  if (previousClosure !== null && previousClosure < closesAt) {
    return { startsAt: previousClosure, closesAt };
  }
  return { startsAt: firstOfThisMonth(day), closesAt };
}

/**
 * La clôture par défaut : le 1er du mois suivant, à 00h00 locales.
 *
 * Hugo la formule « le dernier jour du mois à 00h00, donc le 01 en fait » — et
 * c'est bien le 1er : minuit ferme la journée précédente, il ne l'ouvre pas.
 */
export function defaultClosureAfter(now: Date): Date {
  return firstOfMonthAfter(instantToLocal(now).day);
}

/**
 * Le cycle **calendaire** d'un mois : du 1er à 00h00 locales au 1er du mois
 * suivant, même heure.
 *
 * C'est le cycle par défaut, celui que `cycleAt` rend tant qu'aucune clôture
 * n'est enregistrée. Le relevé l'emploie pour énumérer les cycles PASSÉS, que
 * `cycleAt` ne sait pas reconstituer (plan `agregation-des-commandes`, §2).
 *
 * @param year  année civile, quatre chiffres.
 * @param month 1 à 12 — la validation de forme est faite par l'appelant
 *              (`StatementMonth`), ce module ne l'interprète pas.
 * @throws {BillingCycleBoundaryError} l'heure de clôture n'existe pas ce jour-là.
 */
export function calendarCycle(year: number, month: number): BillingCycle {
  const first = `${String(year)}-${String(month).padStart(2, "0")}-01`;
  return { startsAt: atLocalMidnight(first), closesAt: firstOfMonthAfter(first) };
}

/** `"2026-09-10"` → l'instant du 2026-09-01 à 00h00 locales. */
function firstOfThisMonth(day: string): Date {
  return atLocalMidnight(`${day.slice(0, 7)}-01`);
}

/** `"2026-09-10"` → l'instant du 2026-10-01 à 00h00 locales. */
function firstOfMonthAfter(day: string): Date {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return atLocalMidnight(`${String(next.year)}-${String(next.month).padStart(2, "0")}-01`);
}

/**
 * L'instant de minuit local pour ce jour.
 *
 * `localToInstant` rend `null` quand l'heure demandée **n'existe pas** — le jour
 * du passage à l'heure d'été, 02h30 est sauté. Minuit ne l'est jamais en Europe
 * de l'Ouest, où la bascule se fait à 02h00 et 03h00 ; le refus est donc écrit
 * pour le jour où ce module servirait un autre fuseau, pas pour aujourd'hui.
 * Rendre un instant faux en silence serait la seule issue pire.
 */
function atLocalMidnight(day: string): Date {
  const instant = localToInstant(day, CYCLE_CLOSING_TIME);
  if (instant === null) {
    throw new BillingCycleBoundaryError(day, CYCLE_CLOSING_TIME);
  }
  return instant;
}

/**
 * Cet instant est-il une clôture **calendaire** — un 1er du mois à 00h00
 * locales ?
 *
 * La première clôture enregistrée doit l'être (plan
 * `plan-lot-de-prelevement-fige.md`, §6 bis) : le relevé de cycle a montré des
 * mois civils aux clients, et une première clôture ailleurs ferait changer de
 * relevé des commandes déjà montrées.
 */
export function isCalendarClosure(instant: Date): boolean {
  const local = instantToLocal(instant);
  return local.day.endsWith("-01") && local.time === CYCLE_CLOSING_TIME;
}

/**
 * **Le cycle qu'on constitue** à `now` : celui qui s'est clos au dernier 1er du
 * mois (00h00 locales) atteint, et qui part de la dernière clôture enregistrée
 * AVANT lui — ou, s'il n'y en a pas, du 1er du mois précédent.
 *
 * Toujours clos par construction : sa clôture est ≤ `now`. La constitution ne
 * choisit pas d'instant — une clôture anticipée n'est pas proposée (Q1 : la
 * comptabilité constitue à la main, après la clôture).
 */
export function cycleToConstitute(now: Date, previousClosure: Date | null): BillingCycle {
  const closesAt = cycleAt(now, null).startsAt;
  const calendarStart = cycleAt(new Date(closesAt.getTime() - 1), null).startsAt;
  return {
    startsAt:
      previousClosure !== null && previousClosure < closesAt ? previousClosure : calendarStart,
    closesAt,
  };
}
