import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { StaffStamp } from "../domain/entities/collection-batch.js";
import { CollectionTestReturnedEvent } from "../domain/events/collection-test.events.js";
import { ImportEntryNotRecordableError } from "../domain/errors/bank-return-file-errors.js";
import type { CollectionTestRepository } from "../domain/ports/collection-test.repository.js";
import type { BankReturnFile } from "../domain/services/bank-return-file.js";
import type { ClassifiedReturn } from "./collection-return-import-support.js";

/**
 * Rattache à son prélèvement d'essai une transaction `ESS-…` retenue à la
 * confirmation d'un import (plan `plan-prelevement-d-essai.md`, §4 « Retours »).
 * Charge l'ESSAI, le mute par sa méthode, le sauve, et le dit au journal —
 * aucune ligne de lot, aucune commande, aucun état d'encaissement n'est lu ni
 * écrit.
 *
 * @returns l'identifiant de l'essai.
 */
export async function attachTestReturn(
  writers: { readonly tests: CollectionTestRepository; readonly events: DomainEventPublisher },
  item: ClassifiedReturn,
  source: BankReturnFile["format"],
  recorded: StaffStamp,
): Promise<string> {
  const { entry, reason } = item;
  const test = (await writers.tests.byEndToEndIds([entry.endToEndId])).get(entry.endToEndId);
  if (test === undefined) {
    throw new ImportEntryNotRecordableError(
      entry.endToEndId,
      "aucun essai ne porte cette référence",
    );
  }
  const bankReturn = {
    kind: entry.kind,
    reasonCode: reason.code,
    reasonLabel: reason.label,
    returnedOn: entry.returnedOn,
    amountCents: entry.amountCents,
    source,
    recorded,
  };
  test.recordBankReturn(bankReturn);
  await writers.tests.save(test);
  await writers.events.publishTraced(new CollectionTestReturnedEvent(test, bankReturn));
  return test.id;
}
