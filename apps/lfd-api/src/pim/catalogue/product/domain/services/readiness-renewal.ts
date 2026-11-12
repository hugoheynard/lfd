import { isContentFact } from "../content-facts.js";
import type { ProductReadiness } from "../ports/readiness.repository.js";

/**
 * La signature en place vaut-elle déjà ce qu'une nouvelle déclaration dirait ?
 *
 * Oui quand la même personne a signé et qu'aucun fait de CONTENU n'a eu lieu
 * depuis : signer de nouveau ne déplacerait que la date, et le rejeu du geste
 * journaliserait une validation que personne n'a refaite en regardant autre
 * chose. Une signature périmée, ou posée par quelqu'un d'autre, se remplace :
 * c'est alors un nouvel engagement, et il se trace.
 *
 * @param current la signature en place, `null` si personne ne s'est prononcé.
 * @param signer qui déclare maintenant.
 * @param factTypesSince les types des faits sur la fiche depuis `current.readyAt`.
 */
export function signatureStillHolds(
  current: ProductReadiness | null,
  signer: string,
  factTypesSince: readonly string[],
): boolean {
  if (current === null || current.readyBy !== signer) {
    return false;
  }
  return !factTypesSince.some(isContentFact);
}
