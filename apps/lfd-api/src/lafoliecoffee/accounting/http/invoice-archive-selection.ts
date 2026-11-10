import type { MyInvoicesArchiveQuery } from "@lfd/contracts";

import type { ArchiveSelection } from "../domain/services/invoice-archive.js";

/** La chaîne de requête du zip, déjà validée en forme, vers la sélection du domaine. */
export function archiveSelectionOf(query: MyInvoicesArchiveQuery): ArchiveSelection {
  if (query.ids !== undefined) {
    return { by: "ids", ids: query.ids };
  }
  return {
    by: "filter",
    filter: { year: query.year ?? null, month: query.month ?? null, kind: query.kind ?? null },
  };
}
