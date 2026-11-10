import type { AcceptedSalesTerms, SalesTermsDocument } from "@lfd/contracts";

import { SalesTermsOutdatedError } from "../errors/sales-terms-outdated.error.js";

/**
 * **Le client a-t-il coché les CGV en vigueur ?** (2026-10-26 ; plan
 * `legal/plan-cgv-par-audience.md`, C6) — la case du panier confrontée au
 * texte de l'audience qui tarife la commande.
 *
 * - une révision en vigueur : il faut ce texte-là, à cette révision-là ;
 * - aucune révision (`null`, C1′ « en cours de rédaction ») : il n'y avait
 *   rien à cocher, et seul `null` est admis. La commande passe sans version,
 *   comme avant la case.
 *
 * Une comparaison stricte dans les deux sens : un écran qui affirme une
 * version que le serveur n'a pas a montré autre chose que ce qui s'applique.
 *
 * @throws {SalesTermsOutdatedError} l'acceptation ne correspond pas.
 */
export function ensureSalesTermsAccepted(
  accepted: AcceptedSalesTerms | null,
  document: SalesTermsDocument,
  revisionInForce: number | null,
): void {
  if (revisionInForce === null ? accepted === null : matches(accepted, document, revisionInForce)) {
    return;
  }
  throw new SalesTermsOutdatedError();
}

function matches(
  accepted: AcceptedSalesTerms | null,
  document: SalesTermsDocument,
  revision: number,
): boolean {
  return accepted !== null && accepted.key === document && accepted.revision === revision;
}
