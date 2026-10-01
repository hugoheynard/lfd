import type { StopDecisionView } from "@lfd/contracts";

import type { StopDecisionRow } from "../domain/ports/stop-decisions.reader.js";

/** La décision vivante, telle que les écrans la montrent : un nom vide n'est pas un nom. */
export function stopDecisionView(row: StopDecisionRow): StopDecisionView {
  const name = row.decidedByName ?? "";
  return {
    state: row.outcome ?? "pending",
    source: row.source,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: name === "" ? null : name,
  };
}
