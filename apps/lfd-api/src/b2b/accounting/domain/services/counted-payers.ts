import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { PayerStanding } from "../ports/payer-standing.reader.js";
import { isBillingPayerAt } from "./billing-payer-guard.js";
import { effectiveMandateOf } from "./collection-verdict.js";

/**
 * 🔴 **Qui compte comme « client » d'une entité** — sur le tableau de bord
 * des rythmes comme sur la fiche (Hugo, 2026-10-23) : un seul critère, pour
 * que les deux écrans ne puissent pas annoncer deux nombres.
 *
 * Un compte compte s'il est, à `at` :
 * - **facturé en son nom** — `isBillingPayerAt`, le critère qui autorise à
 *   poser un mode ;
 * - **actif** — la société au statut `active` ;
 * - **prélevable chez CETTE entité** — `effectiveMandateOf`, le mandat que la
 *   constitution du lot prendrait pour une commande qu'il passe lui-même :
 *   actif, signé, sur un compte recopié (`CollectionMandatesReader` ne rend
 *   que ceux-là), au créancier de l'entité, et sans ambiguïté.
 */
export function countedPayerIdsAt(
  legalEntityId: string,
  standings: readonly PayerStanding[],
  mandates: readonly CollectionMandate[],
  at: Date,
): ReadonlySet<string> {
  return new Set(
    standings
      .filter(
        (standing) =>
          standing.active &&
          isBillingPayerAt(standing, at) &&
          effectiveMandateOf(
            { companyId: standing.companyId, placedAt: at, billedCompanyId: standing.companyId },
            { legalEntityId, follows: [], mandates, collectionForms: new Map() },
          ) !== null,
      )
      .map((standing) => standing.companyId),
  );
}
