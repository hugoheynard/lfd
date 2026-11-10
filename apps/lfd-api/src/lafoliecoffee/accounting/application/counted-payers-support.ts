import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type { CountedLotInputsReader } from "../domain/ports/counted-lot-inputs.reader.js";
import type { PayerStandingsReader } from "../domain/ports/payer-standings.reader.js";
import { countedPayerIdsAt } from "../domain/services/counted-payers.js";

/** Ce qu'il faut lire pour compter les clients d'une entité. */
export interface CountedPayersReaders {
  readonly standings: PayerStandingsReader;
  readonly mandates: CollectionMandatesReader;
  readonly lot: CountedLotInputsReader;
}

/**
 * Les clients que compte l'entité à `at` (`countedPayerIdsAt`) — la même
 * lecture pour le tableau de bord des rythmes et pour la fiche, avec les
 * mêmes sources que la constitution du lot.
 */
export async function countedPayerIdsOf(
  readers: CountedPayersReaders,
  legalEntityId: string,
  at: Date,
): Promise<ReadonlySet<string>> {
  const standings = await readers.standings.allAt(at);
  const companyIds = standings.map((s) => s.companyId);
  const mandates = await readers.mandates.activeFor(companyIds);
  const oneOffs = mandates.filter((mandate) => mandate.paymentType === "one_off");
  const [collectionForms, consumedMandates] = await Promise.all([
    readers.lot.collectionFormsAt(companyIds, at),
    readers.lot.consumedMandates(oneOffs.map((mandate) => mandate.mandateId)),
  ]);
  return countedPayerIdsAt(
    legalEntityId,
    standings,
    { mandates, collectionForms, consumedMandates },
    at,
  );
}
