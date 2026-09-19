/**
 * Ce que partagent les deux abonnés du journal pour les **demandes de
 * contact** — {@link OnSupportRequested} (le dépôt) et {@link OnSupportHandled}
 * (la clôture). Les deux ensemble donnent le **délai de traitement** — la seule
 * mesure qui dise si la file est vraiment tenue, et qu'on ne pourrait pas
 * reconstituer après coup.
 *
 * Le **sujet** suit la demande : la société quand il y en a une, la personne
 * sinon — même règle que pour un rendez-vous. Un prospect sans entreprise laisse
 * donc une trace sur lui, et non aucune trace du tout. La règle vit ici, une
 * fois : si le dépôt et la clôture d'une même demande tombaient sur deux sujets
 * différents, le délai ne se reconstituerait plus.
 */

/** Le libellé de suivi des deux abonnés auprès du travail de fond. */
export const SUPPORT_ACTIVITY_WORK = "on-support-activity";

/** Sur quoi porte l'entrée de journal : la société, ou à défaut la personne. */
export function subjectOf(
  companyId: string | null,
  userId: string,
): { subjectType: "company" | "user"; subjectId: string } {
  return companyId === null
    ? { subjectType: "user", subjectId: userId }
    : { subjectType: "company", subjectId: companyId };
}
