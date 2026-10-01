import type {
  PurchaseScenarioIssueProblem,
  PurchaseScenarioIssueView,
  PurchaseScenarioItemKind,
  PurchaseTableFormatRef,
  PurchaseTablePayload,
  PurchaseTableVehicleRef,
} from "@lfd/contracts";

import {
  PurchaseTableItemArchivedError,
  PurchaseTableItemNotFoundError,
  PurchaseTableVehicleWithoutCargoError,
} from "../domain/errors/delivery-purchase-table-errors.js";
import type { PurchaseTableSources } from "./purchase-table-support.js";

/**
 * **Ce qui, dans un scénario rouvert, ne passerait plus au tableau** (B-D5).
 *
 * Les MÊMES cas que `resolveVehicle` / `resolveFormat` (le tableau), mais
 * relevés au lieu d'être levés : un scénario s'ouvre même si un candidat a
 * été archivé depuis — sinon on ne pourrait plus le corriger. La phrase de
 * chaque élément est celle du refus du tableau, construite par la même
 * classe : les deux ne peuvent pas diverger.
 */
export function selectionIssues(
  selection: PurchaseTablePayload,
  sources: PurchaseTableSources,
): readonly PurchaseScenarioIssueView[] {
  return [
    ...selection.vehicles.map((ref) => vehicleIssue(ref, sources)),
    ...selection.formats.map((ref) => formatIssue(ref, sources)),
  ].filter((issue) => issue !== null);
}

function vehicleIssue(
  ref: PurchaseTableVehicleRef,
  sources: PurchaseTableSources,
): PurchaseScenarioIssueView | null {
  if (ref.source === "candidate") {
    const found = sources.vehicleCandidates.find((item) => item.id === ref.id);
    return endedIssue(ref, "vehicle_candidate", found ?? null, found?.archivedAt ?? null);
  }
  const found = sources.fleet.find((item) => item.id === ref.id);
  const ended = endedIssue(ref, "fleet_vehicle", found ?? null, found?.retiredAt ?? null);
  if (ended !== null || found === undefined || found.cargo !== null) {
    return ended;
  }
  return issueOf(
    ref,
    "fleet_vehicle",
    found.name,
    "without_cargo",
    new PurchaseTableVehicleWithoutCargoError(found.name).message,
  );
}

function formatIssue(
  ref: PurchaseTableFormatRef,
  sources: PurchaseTableSources,
): PurchaseScenarioIssueView | null {
  if (ref.source === "candidate") {
    const found = sources.binCandidates.find((item) => item.id === ref.id);
    return endedIssue(ref, "bin_candidate", found ?? null, found?.archivedAt ?? null);
  }
  const found = sources.binTypes.find((item) => item.id === ref.id);
  return endedIssue(ref, "bin_type", found ?? null, found?.archivedAt ?? null);
}

/** Introuvable, ou archivé / retiré — `null` s'il est en cours. */
function endedIssue(
  ref: PurchaseTableVehicleRef | PurchaseTableFormatRef,
  kind: PurchaseScenarioItemKind,
  found: { readonly name: string } | null,
  endedAt: string | null,
): PurchaseScenarioIssueView | null {
  if (found === null) {
    const message = new PurchaseTableItemNotFoundError(kind, ref.id).message;
    return issueOf(ref, kind, null, "not_found", message);
  }
  if (endedAt === null) {
    return null;
  }
  const message = new PurchaseTableItemArchivedError(kind, found.name).message;
  return issueOf(ref, kind, found.name, kind === "fleet_vehicle" ? "retired" : "archived", message);
}

function issueOf(
  ref: PurchaseTableVehicleRef | PurchaseTableFormatRef,
  kind: PurchaseScenarioItemKind,
  name: string | null,
  problem: PurchaseScenarioIssueProblem,
  message: string,
): PurchaseScenarioIssueView {
  return { kind, source: ref.source, id: ref.id, name, problem, message };
}
