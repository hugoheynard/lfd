import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { PayerStanding } from "../ports/payer-standing.reader.js";
import type { CollectionFormName } from "../value-objects/collection-form.js";
import { isBillingPayerAt } from "./billing-payer-guard.js";
import { judgeMandate } from "./collection-verdict.js";

/** Les entrées du lot que le compte rejoue — les mêmes sources que la constitution. */
export interface CountingLotInputs {
  readonly mandates: readonly CollectionMandate[];
  readonly collectionForms: ReadonlyMap<string, CollectionFormName>;
  readonly consumedMandates: ReadonlySet<string>;
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
 * - **débité chez CETTE entité** — `judgeMandate`, le jugement EXACT du lot,
 *   sur un bon qu'il passerait lui-même à `at` : rendu `debit`. Le lot n'est
 *   pas touché ; c'est le compte qui le rejoue (note § 12 bis).
 *
 * `liveSchemes` est vide : un schéma déjà pris par un lot vivant renvoie un
 * bon au lot suivant, il ne fait pas d'un client un non-client.
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
          judgeMandate(
            { companyId: standing.companyId, placedAt: at, billedCompanyId: standing.companyId },
            {
              legalEntityId,
              at,
              follows: standing.follows,
              mandates: inputs.mandates,
              collectionForms: inputs.collectionForms,
              consumedMandates: inputs.consumedMandates,
              liveSchemes: [],
            },
          ).kind === "debit",
      )
      .map((standing) => standing.companyId),
  );
}
