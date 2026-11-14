import { addDays, instantToLocal, localToInstant, type CompanyContactMode } from "@lfd/contracts";

import { WORK_LEVELS, type WorkLevel } from "../../account/domain/services/work-level.js";
import { SalesDayUnreadableError } from "./errors/sales-oversight-errors.js";

/**
 * **Le récap du jour** du suivi commercial, la part pure
 * (`documentation/b2b/plan-suivi-commercial.md`, § 1, § 3.2 et § 3.3) :
 * le jour civil de Paris, les montées de niveau datées à la lecture, et les
 * contacts du jour par mode.
 */

/** Le jour civil de Paris, et ses bornes en instants : `[start, end)`. */
export interface ParisDay {
  /** `AAAA-MM-JJ`. */
  readonly day: string;
  readonly start: Date;
  readonly end: Date;
}

const MIDNIGHT = "00:00";

/**
 * Le jour civil de Paris qui contient `now` — jamais le jour UTC : à 0 h 30 à
 * Paris, le jour UTC est encore la veille. Un jour de bascule d'heure dure 23
 * ou 25 heures ; les bornes le suivent, parce qu'elles sont les deux minuits
 * locaux (minuit existe toujours à Paris : la bascule se fait à 2 h et 3 h).
 *
 * @throws {SalesDayUnreadableError} un minuit local introuvable — impossible
 *   sous le fuseau de Paris, refusé plutôt que deviné.
 */
export function parisDayOf(now: Date): ParisDay {
  const day = instantToLocal(now).day;
  const start = localToInstant(day, MIDNIGHT);
  const end = localToInstant(addDays(day, 1), MIDNIGHT);
  if (start === null || end === null) {
    throw new SalesDayUnreadableError(day);
  }
  return { day, start, end };
}

/** L'instant tombe-t-il dans ce jour de Paris ? */
export function fallsOn(instant: Date | null, day: ParisDay): boolean {
  return instant !== null && instant >= day.start && instant < day.end;
}

/**
 * Les dates où une fiche a pu atteindre chaque niveau — lues dans ce qui
 * existe déjà, jamais écrites (§ 3.2).
 */
export interface SheetMilestones {
  /**
   * Le jour du PREMIER contact : la date notée d'un `company.contacted`, ou le
   * jour à Paris d'un rendez-vous honoré. C'est lui qui date « Contactée » :
   * l'interlocuteur, lui, n'a pas de date.
   */
  readonly firstContactDay: string | null;
  /** Le dernier `company.step_reached` d'adresse (`billing` ou `delivery`). */
  readonly qualifiedStepAt: Date | null;
  /** La première connexion du détenteur. */
  readonly holderFirstLoginAt: Date | null;
  readonly activatedAt: Date | null;
  readonly firstOrderAt: Date | null;
}

export const NO_MILESTONE: SheetMilestones = {
  firstContactDay: null,
  qualifiedStepAt: null,
  holderFirstLoginAt: null,
  activatedAt: null,
  firstOrderAt: null,
};

const rankOf = (level: WorkLevel): number => WORK_LEVELS.indexOf(level);

/** Active : le moment où la seconde des deux conditions a été tenue. */
function activeAt(milestones: SheetMilestones): Date | null {
  const { activatedAt, firstOrderAt } = milestones;
  if (activatedAt === null || firstOrderAt === null) {
    return null;
  }
  return activatedAt > firstOrderAt ? activatedAt : firstOrderAt;
}

/**
 * Le niveau le plus haut que la fiche a atteint CE jour, ou `null`. Un niveau
 * ne compte que si la fiche le tient encore : une adresse archivée fait
 * redescendre la fiche, et la page montre l'état, pas l'historique.
 */
export function levelReachedOn(
  level: WorkLevel,
  milestones: SheetMilestones,
  day: ParisDay,
): WorkLevel | null {
  const reached: readonly (readonly [WorkLevel, boolean])[] = [
    ["active", fallsOn(activeAt(milestones), day)],
    ["opened", fallsOn(milestones.holderFirstLoginAt, day)],
    ["qualified", fallsOn(milestones.qualifiedStepAt, day)],
    ["contacted", milestones.firstContactDay === day.day],
  ];
  const found = reached.find(([candidate, today]) => today && rankOf(level) >= rankOf(candidate));
  return found === undefined ? null : found[0];
}

/** Le canal d'un rendez-vous, et le mode de contact qu'il vaut (§ 3.2 ter). */
const APPOINTMENT_MODES: Readonly<Record<string, CompanyContactMode>> = {
  phone: "phone",
  visio: "visio",
  onsite: "visit",
};

/** Le mode d'un rendez-vous honoré ; `null` pour un canal que le suivi ne connaît pas. */
export function contactModeOfAppointment(channel: string): CompanyContactMode | null {
  return APPOINTMENT_MODES[channel] ?? null;
}

/** Zéro contact, pour chaque mode. */
export function noContacts(): Record<CompanyContactMode, number> {
  // Le type exige chaque mode : un mode ajouté au contrat ne compile pas ici.
  return { phone: 0, email: 0, visit: 0, visio: 0, trade_show: 0, other: 0 };
}

/** Les contacts du jour, comptés par mode. */
export function contactsByMode(
  modes: readonly CompanyContactMode[],
): Readonly<Record<CompanyContactMode, number>> {
  const counts = noContacts();
  for (const mode of modes) {
    counts[mode] += 1;
  }
  return counts;
}

/** Ce qu'il faut d'une fiche lue pour dater sa montée. */
export interface LeveledSheet {
  readonly level: WorkLevel;
  readonly facts: { readonly milestones: SheetMilestones };
}

/** Les fiches montées ce jour, une fois chacune, quel que soit le nombre de niveaux franchis. */
export function levelUpsOn(sheets: readonly LeveledSheet[], day: ParisDay): number {
  return sheets.filter((sheet) => levelReachedOn(sheet.level, sheet.facts.milestones, day) !== null)
    .length;
}

/** Les demandes faites ce jour, parmi des instants de demande. */
export function countOn(instants: readonly Date[], day: ParisDay): number {
  return instants.filter((instant) => fallsOn(instant, day)).length;
}
