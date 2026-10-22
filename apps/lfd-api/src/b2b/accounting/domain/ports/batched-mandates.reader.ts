/**
 * Port de lecture : parmi ces mandats, ceux qu'une ligne d'un lot RÉEL non
 * annulé porte (constitué ou déposé).
 *
 * Plus large que `CollectionCandidatesReader.consumedMandates` (lots déposés
 * seulement) à dessein : un lot constitué partira, et un essai `OOFF` sur le
 * même mandat ponctuel le ferait rejeter (plan `plan-prelevement-d-essai.md`,
 * Q7).
 */
export abstract class BatchedMandatesReader {
  abstract batched(mandateIds: readonly string[]): Promise<ReadonlySet<string>>;
}
