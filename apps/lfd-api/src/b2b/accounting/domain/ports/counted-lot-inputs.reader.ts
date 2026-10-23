import type { CollectionFormName } from "../value-objects/collection-form.js";

/**
 * Les deux lectures du lot que le COMPTE des clients rejoue pour juger
 * comme lui (`countedPayerIdsAt`, note `prelevement-sepa.md` § 12 bis) : la
 * forme de prélèvement des sites et les mandats ponctuels consommés.
 *
 * 🔴 Ce n'est pas une seconde source : l'adaptateur est
 * `CollectionCandidatesReader` lui-même (`useExisting`), celui que lit la
 * constitution (`collection-constitution-support.ts`, vérifié le
 * 2026-10-23) — « consommé » = une ligne dans un lot DÉPOSÉ, et non le
 * `BatchedMandatesReader`, plus large, du prélèvement test.
 */
export abstract class CountedLotInputsReader {
  abstract collectionFormsAt(
    companyIds: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, CollectionFormName>>;

  abstract consumedMandates(mandateIds: readonly string[]): Promise<ReadonlySet<string>>;
}
