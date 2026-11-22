import type { StandingCompanyStatus } from "./company-standing.js";

/** Ce que le prédicat « la société est fermée » lit d'une société. */
export interface CompanyClosureFacts {
  readonly status: StandingCompanyStatus;
  /** Posé quand le compte est supprimé (archivé) ; `null` sinon. */
  readonly archivedAt: Date | null;
}

/** Le statut qui ferme une société, comme la suppression. */
export const CLOSING_STATUS = "terminated" satisfies StandingCompanyStatus;

/**
 * **La société est-elle fermée ?** — supprimée (`archived_at` posé) OU
 * résiliée (`terminated`). Décidé par Hugo le 2026-11-17 (Q3 du plan
 * `plan-archiver-un-compte-jamais-servi.md`) : les deux ferment de la même
 * façon, et la règle est écrite ici une fois.
 *
 * Une société fermée n'entre plus dans l'espace de ses membres (principal,
 * acceptation d'une invitation), n'ouvre aucun rôle (`readCompanyStanding`),
 * n'ouvre pas ses sites par héritage, n'est servie ni tarifée par la
 * boutique, et ne reçoit plus de commande (verrou de la passation).
 *
 * Sa forme de requête est {@link openCompanyWhere} : les deux disent la même
 * chose, l'une sur une ligne lue, l'autre dans un `where`.
 */
export function isCompanyClosed(company: CompanyClosureFacts): boolean {
  return company.archivedAt !== null || company.status === CLOSING_STATUS;
}
