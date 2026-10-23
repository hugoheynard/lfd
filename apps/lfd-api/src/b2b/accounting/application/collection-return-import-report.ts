import type {
  CollectionReturnImportReportView,
  ImportReportEntryView,
  SetAsideImportReportEntryView,
} from "@lfd/contracts";

import type { BankReturnFile } from "../domain/services/bank-return-file.js";
import type { ClassifiedReturn } from "./collection-return-import-support.js";

/** Ce qu'on dit d'une transaction rapprochée que la confirmation n'a pas retenue. */
const NOT_RETAINED = "non retenue à la confirmation";

/**
 * **Le compte rendu d'un import confirmé** (Hugo, 2026-10-23) : chaque
 * transaction lue tombe dans UNE case — enregistrée, déjà enregistrée,
 * introuvable, ou écartée avec sa raison. Il ne décide rien : il relit le
 * classement que la confirmation vient d'appliquer. Pur.
 *
 * `retained` : les `EndToEndId` que la confirmation a enregistrés — elle est
 * tout ou rien, donc ce sont exactement les retenus quand elle aboutit.
 */
export function importReportOf(
  format: BankReturnFile["format"],
  classified: readonly ClassifiedReturn[],
  retained: ReadonlySet<string>,
): CollectionReturnImportReportView {
  const recordable = (item: ClassifiedReturn): boolean =>
    item.status === "matched" || item.status === "collection_test";
  const recorded = classified.filter(
    (item) => recordable(item) && retained.has(item.entry.endToEndId),
  );
  const setAside = classified.filter(
    (item) =>
      item.status === "amount_mismatch" ||
      item.status === "not_returnable" ||
      (recordable(item) && !retained.has(item.entry.endToEndId)),
  );
  return {
    format,
    readCount: classified.length,
    recordedCount: recorded.length,
    alreadyRecordedCount: classified.filter((item) => item.status === "already_returned").length,
    notFound: classified.filter((item) => item.status === "unknown").map(reportEntryOf),
    setAside: setAside.map(setAsideEntryOf),
  };
}

function reportEntryOf({ entry }: ClassifiedReturn): ImportReportEntryView {
  return {
    endToEndId: entry.endToEndId,
    mandateReference: entry.mandateReference,
    amountCents: entry.amountCents,
    returnedOn: entry.returnedOn,
  };
}

function setAsideEntryOf(item: ClassifiedReturn): SetAsideImportReportEntryView {
  return { ...reportEntryOf(item), problem: item.problem ?? NOT_RETAINED };
}
