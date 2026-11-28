import type {
  LaunchedResupplySnapshot,
  ProductionDaySnapshot,
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "./production-day.snapshot.js";
import type {
  PlanEntry,
  PlanVersionCause,
  PlanVersionContent,
  VersionedLaunchedResupply,
  VersionedLine,
  VersionedResupply,
  VersionedShipment,
  VersionedWithdrawal,
  WithdrawalEntry,
} from "./plan-version.content.js";

/**
 * **Construire le contenu d'une version** — règles pures de
 * `PlanVersion.next` (`documentation/fournil/les-versions-du-plan.md`). Tout est rangé dans un ordre stable (envois par commande puis
 * rang, compte par SKU, réassorts par identifiant) : deux versions du même
 * plan ont le même contenu, quel que soit l'ordre où la journée a été relue.
 */

/** Ce que la version précédente apporte à la déduction. */
export interface PreviousPlan {
  readonly closedAt: Date;
  readonly content: PlanVersionContent;
}

/** Les causes qui arrêtent la journée : sans version précédente, l'envoi est `arrested`. */
const ARREST_CAUSES: ReadonlySet<PlanVersionCause> = new Set([
  "closed",
  "auto_closed",
  "opened_by_resupply",
]);

/** Le premier rang : la commande elle-même. */
const FIRST_RANK = 1;

export function shipmentKey(orderId: string, rank: number): string {
  return `${orderId}#${rank}`;
}

/** Le contenu de la version qui suivrait `previous`, pour cet état et ce geste. */
export function contentOf(
  previous: PreviousPlan | null,
  snapshot: ProductionDaySnapshot,
  closedAt: Date,
  cause: PlanVersionCause,
  withdrawn: readonly WithdrawalEntry[],
): PlanVersionContent {
  const entryOf = entryRule(previous, closedAt, cause);
  return {
    shipments: [...snapshot.orders].sort(byShipment).map((order) => shipmentOf(order, entryOf)),
    counts: [...snapshot.counts]
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((count) => ({
        sku: count.sku,
        productName: count.productName,
        quantity: count.quantity,
        saleUnit: count.saleUnit,
      })),
    resupplies: [...(snapshot.resupplies ?? [])].sort(byResupply).map(resupplyOf),
    launchedResupplies: [...(snapshot.launchedResupplies ?? [])].sort(byResupply).map(launchedOf),
    withdrawn: withdrawnOf(previous, snapshot.orders, withdrawn),
  };
}

/**
 * La règle d'entrée (§ 1.7) : sans version précédente, `arrested` pour un
 * arrêt, `unknown` sinon ; un arrêt différent de celui de la précédente,
 * `arrested_after_reopen` ; un envoi déjà là, `unchanged` ; un envoi neuf
 * par un retirage, `retaken`.
 */
function entryRule(
  previous: PreviousPlan | null,
  closedAt: Date,
  cause: PlanVersionCause,
): (orderId: string, rank: number) => PlanEntry {
  if (previous === null) {
    const entry: PlanEntry = ARREST_CAUSES.has(cause) ? "arrested" : "unknown";
    return () => entry;
  }
  if (previous.closedAt.getTime() !== closedAt.getTime()) {
    return () => "arrested_after_reopen";
  }
  const known = new Set(
    previous.content.shipments.map((shipment) => shipmentKey(shipment.orderId, shipment.rank)),
  );
  return (orderId, rank) => {
    if (known.has(shipmentKey(orderId, rank))) {
      return "unchanged";
    }
    // Seul un retirage fait entrer un envoi dans un plan arrêté ; un autre
    // geste qui en ferait entrer un n'a pas de raison connue.
    return cause === "retaken" ? "retaken" : "unknown";
  };
}

function shipmentOf(
  order: ProductionOrderSnapshot,
  entryOf: (orderId: string, rank: number) => PlanEntry,
): VersionedShipment {
  return {
    orderId: order.orderId,
    rank: order.rank,
    reference: order.reference,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    dueAt: order.dueAt,
    offPlan: order.offPlan,
    entry: entryOf(order.orderId, order.rank),
    lines: order.lines.map(lineOf),
  };
}

function lineOf(line: ProductionLineSnapshot): VersionedLine {
  return {
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    saleUnit: line.saleUnit,
    options: line.options ?? [],
  };
}

function resupplyOf(resupply: ProductionResupplySnapshot): VersionedResupply {
  return {
    resupplyId: resupply.resupplyId,
    siteId: resupply.siteId,
    siteLabel: resupply.siteLabel,
    name: resupply.name,
    lines: resupply.lines.map(lineOf),
  };
}

function launchedOf(resupply: LaunchedResupplySnapshot): VersionedLaunchedResupply {
  return {
    ...resupplyOf(resupply),
    launchedAt: resupply.launched.at.toISOString(),
    launchedBy: resupply.launched.by,
  };
}

/**
 * Les retirées, un envoi par rang : les rangs du plan courant, sinon ceux
 * qu'une version précédente a nommés, sinon le premier. L'auteur vient du
 * geste (l'écrivain le connaît pour le retrait qu'il fait), sinon de la
 * version précédente qui l'a vu passer, sinon `null`.
 */
function withdrawnOf(
  previous: PreviousPlan | null,
  orders: readonly ProductionOrderSnapshot[],
  entries: readonly WithdrawalEntry[],
): readonly VersionedWithdrawal[] {
  const before = previous?.content.withdrawn ?? [];
  return entries
    .flatMap((entry) =>
      ranksOf(entry.orderId, orders, previous).map((rank) => ({
        orderId: entry.orderId,
        rank,
        at: entry.at.toISOString(),
        by:
          entry.by ??
          before.find((known) => known.orderId === entry.orderId && known.rank === rank)?.by ??
          null,
      })),
    )
    .sort(byShipment);
}

function ranksOf(
  orderId: string,
  orders: readonly ProductionOrderSnapshot[],
  previous: PreviousPlan | null,
): readonly number[] {
  const planned = orders.filter((order) => order.orderId === orderId).map((order) => order.rank);
  if (planned.length > 0) {
    return planned;
  }
  const named = [
    ...(previous?.content.shipments ?? []),
    ...(previous?.content.withdrawn ?? []),
  ].filter((shipment) => shipment.orderId === orderId);
  return named.length > 0 ? [...new Set(named.map((shipment) => shipment.rank))] : [FIRST_RANK];
}

function byShipment(
  a: { readonly orderId: string; readonly rank: number },
  b: { readonly orderId: string; readonly rank: number },
): number {
  return a.orderId.localeCompare(b.orderId) || a.rank - b.rank;
}

function byResupply(
  a: { readonly resupplyId: string },
  b: { readonly resupplyId: string },
): number {
  return a.resupplyId.localeCompare(b.resupplyId);
}

/**
 * **Le plan a-t-il changé ?** (§ 1.6) — commandes, lignes, compte,
 * réassorts ou retirées. `entry` n'entre pas dans la comparaison : un envoi
 * `arrested` devient `unchanged` à la version suivante sans que le plan
 * change. L'auteur d'une retirée non plus : il complète une trace, il ne
 * change pas le plan. Les clés sont triées avant comparaison : `jsonb` ne
 * garde pas l'ordre des clés d'un objet.
 */
export function samePlan(a: PlanVersionContent, b: PlanVersionContent): boolean {
  return canonical(comparable(a)) === canonical(comparable(b));
}

function comparable(content: PlanVersionContent): unknown {
  return {
    shipments: content.shipments.map(({ entry: _entry, lines, ...shipment }) => ({
      ...shipment,
      lines: [...lines.map(canonical)].sort(),
    })),
    counts: content.counts,
    resupplies: content.resupplies,
    launchedResupplies: content.launchedResupplies,
    withdrawn: content.withdrawn.map(({ by: _by, ...withdrawal }) => withdrawal),
  };
}

/** Une écriture JSON aux clés triées, à tous les niveaux. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
