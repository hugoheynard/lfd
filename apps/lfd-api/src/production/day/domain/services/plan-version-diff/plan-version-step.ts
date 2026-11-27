import type {
  PlanEntry,
  PlanVersionContent,
  VersionedLine,
  VersionedResupply,
  VersionedShipment,
} from "../../entities/plan-version.content.js";
import { shipmentKey } from "../../entities/plan-version.build.js";
import {
  TO_CHECK,
  type EntryReason,
  type LineChange,
  type PlanVersionMark,
  type ResupplyChange,
  type ShipmentChange,
  type ShipmentRef,
  type UnexplainedExit,
} from "./plan-version-diff.types.js";

/**
 * **Ce qu'une version a changé par rapport à la précédente** — un pas de
 * l'enchaînement de `diffPlanVersions` (§ 1.18 à 1.21). Chaque changement est
 * attribué à `mark`, la version qui l'a fait.
 */

/** Deux versions qui se suivent, la seconde marquée. */
export interface PlanVersionPair {
  readonly before: PlanVersionContent;
  readonly beforeClosedAt: Date;
  readonly after: PlanVersionContent;
  readonly mark: PlanVersionMark;
}

/** Ce qu'un pas rend. */
export interface PlanVersionStep {
  readonly changes: readonly ShipmentChange[];
  readonly resupplies: readonly ResupplyChange[];
  readonly toCheck: readonly UnexplainedExit[];
}

export function stepOf(pair: PlanVersionPair): PlanVersionStep {
  return {
    changes: [...shipmentChanges(pair), ...withdrawals(pair)].sort(byShipment),
    resupplies: resupplyChanges(pair),
    toCheck: exits(pair).toCheck,
  };
}

function shipmentChanges(pair: PlanVersionPair): readonly ShipmentChange[] {
  const before = byKey(pair.before.shipments);
  const changes: ShipmentChange[] = [];
  for (const shipment of pair.after.shipments) {
    const previous = before.get(shipmentKey(shipment.orderId, shipment.rank));
    if (previous === undefined) {
      changes.push(entered(shipment, pair.mark));
      continue;
    }
    const lines = lineChanges(previous.lines, shipment.lines);
    if (lines.length > 0) {
      changes.push({ kind: linesKind(pair), shipment: refOf(shipment), by: pair.mark, lines });
    }
  }
  return [...changes, ...exits(pair).explained];
}

function entered(shipment: VersionedShipment, by: PlanVersionMark): ShipmentChange {
  return {
    kind: "entered",
    shipment: refOf(shipment),
    by,
    entry: shipment.entry,
    offPlan: shipment.offPlan,
    reason: reasonOf(shipment.entry, shipment.offPlan),
  };
}

/** § 1.7 : « hors plan » complète l'entrée, il ne la remplace pas. */
function reasonOf(entry: PlanEntry, offPlan: boolean | null): EntryReason {
  switch (entry) {
    case "retaken":
      return offPlan === true ? "retaken_off_plan" : "retaken";
    case "arrested_after_reopen":
      return offPlan === true ? "rearrested_off_plan" : "rearrested";
    case "arrested":
      return "arrested";
    case "unchanged":
    case "unknown":
      return "unknown";
  }
}

/** Une réouverture d'abord : une version `order_revised` ne change pas d'arrêt. */
function linesKind(pair: PlanVersionPair): "revised" | "modified_during_reopen" | "lines_changed" {
  if (pair.beforeClosedAt.getTime() !== pair.mark.closedAt.getTime()) {
    return "modified_during_reopen";
  }
  return pair.mark.cause === "order_revised" ? "revised" : "lines_changed";
}

/** Les quantités sommées par article : une ligne par option ne se lit pas comme un changement. */
export function lineChanges(
  before: readonly VersionedLine[],
  after: readonly VersionedLine[],
): readonly LineChange[] {
  const was = totals(before);
  const is = totals(after);
  const skus = [...new Set([...was.keys(), ...is.keys()])].sort((a, b) => a.localeCompare(b));
  return skus.flatMap((sku) => {
    const old = was.get(sku);
    const now = is.get(sku);
    const known = now ?? old;
    const quantityBefore = old?.quantity ?? 0;
    const quantityAfter = now?.quantity ?? 0;
    if (known === undefined || quantityBefore === quantityAfter) {
      return [];
    }
    return [
      {
        sku,
        productName: known.productName,
        saleUnit: known.saleUnit,
        before: quantityBefore,
        after: quantityAfter,
      },
    ];
  });
}

function totals(lines: readonly VersionedLine[]): ReadonlyMap<string, VersionedLine> {
  const sums = new Map<string, VersionedLine>();
  for (const line of lines) {
    const known = sums.get(line.sku);
    sums.set(
      line.sku,
      known === undefined ? line : { ...known, quantity: known.quantity + line.quantity },
    );
  }
  return sums;
}

/** Les retraits que cette version inscrit pour la première fois. */
function withdrawals(pair: PlanVersionPair): readonly ShipmentChange[] {
  const known = new Set(pair.before.withdrawn.map((w) => shipmentKey(w.orderId, w.rank)));
  return pair.after.withdrawn
    .filter((withdrawal) => !known.has(shipmentKey(withdrawal.orderId, withdrawal.rank)))
    .map((withdrawal) => ({
      kind: "withdrawn",
      shipment: findRef(pair, withdrawal.orderId, withdrawal.rank),
      by: pair.mark,
      withdrawnAt: withdrawal.at,
      withdrawnBy: withdrawal.by,
    }));
}

/**
 * Les envois de la précédente absents de celle-ci : une retirée sort pour
 * une raison connue ; les autres, la raison est au commerce (§ 1.19).
 */
function exits(pair: PlanVersionPair): {
  readonly explained: readonly ShipmentChange[];
  readonly toCheck: readonly UnexplainedExit[];
} {
  const kept = byKey(pair.after.shipments);
  const withdrawn = new Set(pair.after.withdrawn.map((w) => shipmentKey(w.orderId, w.rank)));
  const gone = pair.before.shipments.filter(
    (shipment) => !kept.has(shipmentKey(shipment.orderId, shipment.rank)),
  );
  const isWithdrawn = (shipment: VersionedShipment): boolean =>
    withdrawn.has(shipmentKey(shipment.orderId, shipment.rank));
  return {
    explained: gone.filter(isWithdrawn).map((shipment) => ({
      kind: "left_after_withdrawal",
      shipment: refOf(shipment),
      by: pair.mark,
    })),
    toCheck: gone
      .filter((shipment) => !isWithdrawn(shipment))
      .map((shipment) => ({
        kind: "left_reason_at_commerce",
        severity: TO_CHECK,
        shipment: refOf(shipment),
        by: pair.mark,
      })),
  };
}

function resupplyChanges(pair: PlanVersionPair): readonly ResupplyChange[] {
  const mark = pair.mark;
  const change =
    (kind: ResupplyChange["kind"]) =>
    (resupply: VersionedResupply): ResupplyChange => ({
      kind,
      resupplyId: resupply.resupplyId,
      siteLabel: resupply.siteLabel,
      name: resupply.name,
      by: mark,
    });
  const beforeAll = [...pair.before.resupplies, ...pair.before.launchedResupplies];
  const afterAll = [...pair.after.resupplies, ...pair.after.launchedResupplies];
  const launchedBefore = ids(pair.before.launchedResupplies);
  const allBefore = ids(beforeAll);
  const allAfter = ids(afterAll);
  return [
    ...pair.after.launchedResupplies
      .filter((resupply) => !launchedBefore.has(resupply.resupplyId))
      .map(change("launched")),
    ...pair.after.resupplies
      .filter((resupply) => !allBefore.has(resupply.resupplyId))
      .map(change("entered")),
    ...beforeAll.filter((resupply) => !allAfter.has(resupply.resupplyId)).map(change("left")),
  ];
}

function ids(resupplies: readonly VersionedResupply[]): ReadonlySet<string> {
  return new Set(resupplies.map((resupply) => resupply.resupplyId));
}

function byKey(shipments: readonly VersionedShipment[]): ReadonlyMap<string, VersionedShipment> {
  return new Map(
    shipments.map((shipment) => [shipmentKey(shipment.orderId, shipment.rank), shipment]),
  );
}

function refOf(shipment: VersionedShipment): ShipmentRef {
  return {
    orderId: shipment.orderId,
    rank: shipment.rank,
    reference: shipment.reference,
    customerLabel: shipment.customerLabel,
  };
}

/** Une retirée se nomme par le plan qui la porte encore, sinon par l'identifiant seul. */
function findRef(pair: PlanVersionPair, orderId: string, rank: number): ShipmentRef {
  const key = shipmentKey(orderId, rank);
  const found = byKey(pair.after.shipments).get(key) ?? byKey(pair.before.shipments).get(key);
  return found === undefined
    ? { orderId, rank, reference: null, customerLabel: null }
    : refOf(found);
}

function byShipment(a: ShipmentChange, b: ShipmentChange): number {
  return a.shipment.orderId.localeCompare(b.shipment.orderId) || a.shipment.rank - b.shipment.rank;
}
