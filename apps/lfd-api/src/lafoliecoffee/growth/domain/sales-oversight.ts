import {
  workLevelOf,
  type WorkGap,
  type WorkLevel,
  type WorkLevelInput,
} from "../../account/domain/services/work-level.js";
import { businessDaysBetween } from "./business-days.js";
import type { SheetMilestones } from "./sales-today.js";

/**
 * **Le suivi commercial**, la part pure : lire une fiche (niveau, manques,
 * signaux, âge), puis filtrer, compter et paginer le tableau
 * (`documentation/b2b/plan-suivi-commercial.md`, § 1 et § 3.3).
 *
 * Les seuils sont ceux que Hugo a retenus le 2026-11-14 en attendant de les
 * revoir sur la production (§ 5, question 1).
 */

/** Une fiche au niveau Annuaire depuis plus de ce nombre de jours est en retard. */
export const LATE_DIRECTORY_DAYS = 7;
/** Une fiche au niveau Contactée depuis plus de ce nombre de jours est en retard. */
export const LATE_CONTACTED_DAYS = 14;
/** À partir de ce nombre de demandes d'accès sans connexion, l'accès a été relancé. */
export const ACCESS_RESENT_THRESHOLD = 2;
/** Au-delà de ce nombre d'adresses de livraison vivantes, un lieu de plus est un site. */
export const DELIVERY_ADDRESSES_PER_SHEET = 1;
/** Une inscription du client sans suiveur depuis plus de ce nombre de jours ouvrés n'a été rappelée par personne (§ 3.5). */
export const UNASSIGNED_SIGNUP_BUSINESS_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SalesSignal = "late" | "access_resent" | "multiple_addresses" | "unassigned_signup";
export type SalesChannel = "self" | "staff";

/** Ce que la base dit d'une fiche principale — des faits, pas un verdict. */
export interface SalesSheetFacts {
  readonly companyId: string;
  readonly reference: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly declaredVia: SalesChannel | null;
  readonly followedByStaffId: string | null;
  readonly work: WorkLevelInput;
  /** Les dates de niveau, pour les montées du récap du jour. */
  readonly milestones: SheetMilestones;
}

/** Les demandes d'envoi de l'accès client d'une fiche. */
export interface AccessRequests {
  readonly count: number;
  readonly last: Date | null;
}

export const NO_ACCESS_REQUEST: AccessRequests = { count: 0, last: null };

/** Une fiche lue : ses faits, et ce que le suivi en conclut. */
export interface SalesSheet {
  readonly facts: SalesSheetFacts;
  readonly level: WorkLevel;
  readonly missing: readonly WorkGap[];
  readonly ageDays: number;
  readonly signals: readonly SalesSignal[];
  readonly access: AccessRequests;
}

/** Lit une fiche à l'instant `now`. Pur. */
export function readSalesSheet(
  facts: SalesSheetFacts,
  access: AccessRequests,
  now: Date,
): SalesSheet {
  const { level, missing } = workLevelOf(facts.work);
  const ageDays = Math.max(0, Math.floor((now.getTime() - facts.createdAt.getTime()) / DAY_MS));
  return {
    facts,
    level,
    missing,
    ageDays,
    access,
    signals: [...signalsOf(facts, level, ageDays, access), ...signupSignalsOf(facts, now)],
  };
}

function signalsOf(
  facts: SalesSheetFacts,
  level: WorkLevel,
  ageDays: number,
  access: AccessRequests,
): SalesSignal[] {
  const signals: SalesSignal[] = [];
  if (isLate(level, ageDays)) {
    signals.push("late");
  }
  if (access.count >= ACCESS_RESENT_THRESHOLD && !facts.work.holderLoggedIn) {
    signals.push("access_resent");
  }
  if (facts.work.deliveryAddressCount > DELIVERY_ADDRESSES_PER_SHEET) {
    signals.push("multiple_addresses");
  }
  return signals;
}

/**
 * Un prospect venu de lui-même et que personne ne suit : le manque le plus
 * cher. Au-delà du seuil de jours ouvrés depuis son inscription, il se signale.
 */
function signupSignalsOf(facts: SalesSheetFacts, now: Date): SalesSignal[] {
  const unassignedSignup =
    facts.declaredVia === "self" &&
    facts.followedByStaffId === null &&
    businessDaysBetween(facts.createdAt, now) > UNASSIGNED_SIGNUP_BUSINESS_DAYS;
  return unassignedSignup ? ["unassigned_signup"] : [];
}

/** L'âge se compte depuis l'ouverture de la fiche, la seule date que tient chaque niveau bas. */
function isLate(level: WorkLevel, ageDays: number): boolean {
  if (level === "directory") {
    return ageDays > LATE_DIRECTORY_DAYS;
  }
  return level === "contacted" && ageDays > LATE_CONTACTED_DAYS;
}

/** Les filtres que le domaine applique après lecture. */
export interface SalesSheetSelection {
  readonly level?: WorkLevel | undefined;
  readonly signal?: SalesSignal | undefined;
  readonly page: number;
  readonly pageSize: number;
}

export interface SalesSheetPage {
  /** Par niveau, après le filtre de signal — jamais celui de niveau. */
  readonly counts: Readonly<Record<WorkLevel, number>>;
  readonly total: number;
  readonly rows: readonly SalesSheet[];
}

/**
 * Compte, filtre et découpe. Les compteurs ignorent le filtre de niveau :
 * ils servent à choisir un niveau, et ne doivent pas tomber à zéro dès qu'on
 * en a choisi un. L'ordre est celui reçu.
 */
export function selectSalesSheets(
  sheets: readonly SalesSheet[],
  selection: SalesSheetSelection,
): SalesSheetPage {
  const signalled = sheets.filter(
    (sheet) => selection.signal === undefined || sheet.signals.includes(selection.signal),
  );
  const counts: Record<WorkLevel, number> = {
    directory: 0,
    contacted: 0,
    qualified: 0,
    opened: 0,
    active: 0,
  };
  for (const sheet of signalled) {
    counts[sheet.level] += 1;
  }
  const kept = signalled.filter(
    (sheet) => selection.level === undefined || sheet.level === selection.level,
  );
  const start = (selection.page - 1) * selection.pageSize;
  return { counts, total: kept.length, rows: kept.slice(start, start + selection.pageSize) };
}
