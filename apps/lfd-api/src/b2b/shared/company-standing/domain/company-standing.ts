import { effectiveRole } from "./effective-role.js";
import type { StandingRole } from "./standing-role.js";

/** Miroir de l'enum Prisma `CompanyStatus` (cf. {@link StandingRole}). */
export type StandingCompanyStatus = "pending" | "active" | "suspended" | "terminated";

/** Le principal par lequel une personne atteint un site, figé à la lecture. */
export interface StandingPrincipal {
  readonly companyId: string;
  /** Son enseigne, sa raison sociale à défaut. */
  readonly name: string;
  /** Le rôle de la personne au principal — `owner` ou `admin`, seuls à ouvrir. */
  readonly role: StandingRole;
}

/**
 * **La place d'une personne dans une société** — ce que la requête partagée
 * rend (plan `plan-entrer-dans-ses-sites.md`, R1). Les deux sources restent
 * séparées : le rôle effectif se calcule à partir d'elles
 * ({@link standingRole}), et la lecture de la facturation n'en lit pas la même
 * chose ({@link billingReadingRole}, Q1).
 */
export interface CompanyStanding {
  /**
   * Le statut de la société visée, lu dans la même requête : un mur qui le
   * demande séparément ouvrirait une fenêtre où l'un est vrai et l'autre plus.
   */
  readonly companyStatus: StandingCompanyStatus;
  /** La membership propre qui ouvre la société, ou `null`. */
  readonly own: StandingRole | null;
  /**
   * Cette membership propre est-elle ACCEPTÉE — et pas seulement une
   * invitation vivante ? Le mur de l'annulation l'exige (C6.2, B2).
   */
  readonly ownAccepted: boolean;
  /** Le principal qui ouvre ce site à la personne, ou `null` (R3 : jamais l'inverse). */
  readonly via: StandingPrincipal | null;
}

/** Le rôle effectif (R2) : le MAX du propre et de l'hérité plafonné à `admin`. */
export function standingRole(standing: CompanyStanding | null): StandingRole | null {
  if (standing === null) {
    return null;
  }
  return effectiveRole(standing.own, standing.via?.role ?? null);
}

/**
 * Le rôle qui compte pour **lire** les factures, les impayés et le compte
 * bancaire (Q1, Hugo, 2026-10-23) : le détenteur du principal les voit dans
 * ses sites, un `admin` hérité non.
 *
 * Le détenteur hérité lit donc comme `billing` — le rôle que les deux murs
 * de lecture admettent (`invoice-access.ts`, `bank-account-access.ts`,
 * relus le 2026-10-23) —, et seulement pour LIRE : les gestes sur le compte
 * bancaire lisent {@link standingRole}, où il reste `admin`, refusé. Sans
 * héritage du détenteur, c'est la membership propre qui parle, et elle seule :
 * l'`admin` hérité ne lit pas plus qu'un étranger.
 */
export function billingReadingRole(standing: CompanyStanding | null): StandingRole | null {
  if (standing === null) {
    return null;
  }
  if (standing.via?.role === "owner" && standing.own !== "owner") {
    return "billing";
  }
  return standing.own;
}
