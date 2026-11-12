import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { PayerStanding } from "../ports/payer-standing.reader.js";
import type { CollectionFormName } from "../value-objects/collection-form.js";
import { isBillingPayerAt } from "./billing-payer-guard.js";
import { isDebitedHereAt } from "./collection-verdict.js";
import type { PayersCollectionMeans } from "./payers-collection-means.js";

/** Les entrées du lot que le compte rejoue — les mêmes sources que la constitution. */
export interface CountingLotInputs {
  readonly mandates: readonly CollectionMandate[];
  readonly collectionForms: ReadonlyMap<string, CollectionFormName>;
  readonly consumedMandates: ReadonlySet<string>;
  /** Le moyen d'encaissement des payeurs chez cette entité (K3, K5). */
  readonly collectionMeans: PayersCollectionMeans;
}

/**
 * 🔴 **Qui compte comme « client » d'une entité** — sur le tableau de bord
 * des rythmes comme sur la fiche (Hugo, 2026-10-23) : un seul critère, pour
 * que les deux écrans ne puissent pas annoncer deux nombres.
 *
 * Un compte compte s'il est, à `at` :
 * - **actif** — la société au statut `active` (décision d'AFFICHAGE : le lot,
 *   lui, prélève une société suspendue pour ses dettes) ;
 * - **facturé en son nom** — `isBillingPayerAt` ;
 * - **au compte chez CETTE entité** (K5, plan
 *   `plan-paiement-au-compte-par-virement.md`) — par virement à `at`, ou
 *   débité : `isDebitedHereAt`, le jugement EXACT du lot. Le lot n'est pas
 *   touché ; c'est le compte qui le rejoue (note § 12 bis). Un payeur au
 *   virement reste un client de l'entité.
 */
export function countedPayerIdsAt(
  legalEntityId: string,
  standings: readonly PayerStanding[],
  inputs: CountingLotInputs,
  at: Date,
): ReadonlySet<string> {
  return new Set(
    standings
      .filter(
        (standing) =>
          standing.active &&
          isBillingPayerAt(standing, at) &&
          (inputs.collectionMeans.at(standing.companyId, at) === "bank_transfer" ||
            isDebitedHereAt(standing.companyId, {
              legalEntityId,
              at,
              follows: standing.follows,
              mandates: inputs.mandates,
              collectionForms: inputs.collectionForms,
              consumedMandates: inputs.consumedMandates,
              collectionMeansOf: (payerId) => inputs.collectionMeans.at(payerId, at),
            })),
      )
      .map((standing) => standing.companyId),
  );
}
