import { closingWindowAt, suspendedFromOf } from "../rule-lifecycle.js";
import type { CompanyMercurialeState } from "./company-mercuriale-state.js";

/**
 * **L'état d'une mercuriale close.** Terminal : elle cesse d'agir et **rend
 * sa place**.
 *
 * Rendre sa place est le point : c'est la condition pour en reposer une sur la
 * même période, et c'est ce que la contrainte d'exclusion partielle
 * (`WHERE archived_at IS NULL`) traduit en base.
 *
 * Rien n'est effacé — une lecture datée d'avant la clôture la retrouve, et ce
 * qu'elle a facturé est figé sur les commandes. Les lecteurs filtrent
 * `archived_at IS NULL` : clore écrit donc **aussi** la fin dans la fenêtre,
 * où le domaine la lit, pour que le passé la garde.
 *
 * {@link closingWindowAt} porte les quatre cas — dont les **trois** où ne rien
 * borner est la bonne réponse. L'agrégat vérifie avant qu'elle n'est pas déjà
 * close.
 */
export function closedState(
  state: CompanyMercurialeState,
  by: string,
  at: Date,
  reason: string | null,
): CompanyMercurialeState {
  const closedAt = closingWindowAt(state, suspendedFromOf(state.lifecycle), at);
  return {
    ...state,
    ...(closedAt === null ? {} : { validTo: closedAt }),
    // Ses avenants sont rangés avec elle, au même instant et pour le même
    // motif. Leur fenêtre n'est pas réécrite : elle est coupée à la lecture
    // par celle du document, que `closedAt` vient de borner.
    amendments: state.amendments.map((amendment) =>
      amendment.archivedAt === null
        ? { ...amendment, archivedAt: at, archivedBy: by, archiveReason: reason }
        : amendment,
    ),
    lifecycle: { ...state.lifecycle, archivedAt: at, archivedBy: by, archiveReason: reason },
  };
}
