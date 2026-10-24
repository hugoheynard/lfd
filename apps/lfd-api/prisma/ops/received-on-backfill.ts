import { instantToLocal } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { BackfillOrderReceivedOnCommand } from "../../src/b2b/accounting/application/commands/backfill-order-received-on.command.js";
import type { OrderHandoverHistoryReader } from "../../src/handover/channels/commerce/index.js";
import type { PrismaService } from "../../src/platform/database/prisma.service.js";

/**
 * **La reprise des dates de réception** — le cœur du script
 * `ops:received-on-backfill` (plan `documentation/commandes/plan-date-de-reception.md`, §8).
 *
 * Il LIT par Prisma (les contrôles) et n'ÉCRIT que par le bus
 * (`BackfillOrderReceivedOnCommand`) : aucune instruction d'écriture ici.
 * L'attestation de retrait se lit par le canal que le retrait publie pour le
 * commerce, jamais en joignant le schéma `production`.
 */
export interface BackfillDeps {
  readonly prisma: PrismaService;
  readonly commands: CommandBus;
  readonly handovers: OrderHandoverHistoryReader;
  readonly log: (line: string) => void;
}

/** Une commande citée par un contrôle. */
export interface CitedOrder {
  readonly orderNumber: string;
  readonly handedOverAt: Date | null;
}

/** Les contrôles « avant » (§8.2). */
export interface BeforeChecks {
  /** 1 — remises sans date : ce que la reprise datera. */
  readonly pending: readonly (CitedOrder & { readonly id: string })[];
  /** 2 — parmi elles, sans ligne `order_handover` : datées par le repli. */
  readonly withoutHandover: readonly string[];
  /** 3 — parmi elles, déjà sur une facture (la ligne figée ne bougera pas). */
  readonly onInvoice: readonly string[];
  /** 5 — une date sans remise : NE SE RÉPARE PAS, listée pour décision. */
  readonly datedWithoutHandover: readonly string[];
}

/** Les contrôles « après » (§8.2) — chacun doit rendre zéro, sauf l'écart (n° 3, informatif). */
export interface AfterChecks {
  readonly stillPending: readonly string[];
  readonly movedDates: readonly string[];
  readonly offSimpleRule: readonly string[];
  readonly movedInvoiceLines: number;
  readonly datedWithoutHandover: readonly string[];
}

export interface BackfillReport {
  readonly before: BeforeChecks;
  readonly dated: number;
  readonly after: AfterChecks | null;
}

interface Snapshot {
  readonly orders: ReadonlyMap<string, string | null>;
  readonly invoiceLines: ReadonlyMap<string, string | null>;
}

const isoDay = (day: Date | null): string | null => day?.toISOString().slice(0, 10) ?? null;

async function readBefore(deps: BackfillDeps): Promise<BeforeChecks> {
  const pending = await deps.prisma.order.findMany({
    where: { handedOverAt: { not: null }, receivedOn: null },
    select: { id: true, orderNumber: true, handedOverAt: true },
    orderBy: { createdAt: "asc" },
  });
  const ids = pending.map((order) => order.id);
  const attested = await deps.handovers.ofOrders(ids);
  const invoiced = await deps.prisma.invoiceOrder.findMany({
    where: { orderId: { in: ids } },
    select: { orderId: true },
  });
  const invoicedIds = new Set(invoiced.map((line) => line.orderId));
  return {
    pending,
    withoutHandover: pending.filter((o) => !attested.has(o.id)).map((o) => o.orderNumber),
    onInvoice: pending.filter((o) => invoicedIds.has(o.id)).map((o) => o.orderNumber),
    datedWithoutHandover: await datedWithoutHandover(deps.prisma),
  };
}

async function datedWithoutHandover(prisma: PrismaService): Promise<readonly string[]> {
  const rows = await prisma.order.findMany({
    where: { receivedOn: { not: null }, handedOverAt: null },
    select: { orderNumber: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => row.orderNumber);
}

async function snapshot(prisma: PrismaService): Promise<Snapshot> {
  const orders = await prisma.order.findMany({ select: { id: true, receivedOn: true } });
  const lines = await prisma.invoiceOrder.findMany({
    select: { invoiceId: true, orderId: true, receivedOn: true },
  });
  return {
    orders: new Map(orders.map((o) => [o.id, isoDay(o.receivedOn)])),
    invoiceLines: new Map(lines.map((l) => [`${l.invoiceId}/${l.orderId}`, isoDay(l.receivedOn)])),
  };
}

async function readAfter(prisma: PrismaService, before: Snapshot): Promise<AfterChecks> {
  const now = await snapshot(prisma);
  const orders = await prisma.order.findMany({
    where: { handedOverAt: { not: null } },
    select: { id: true, orderNumber: true, handedOverAt: true, receivedOn: true },
  });
  const moved = orders.filter((o) => {
    const was = before.orders.get(o.id) ?? null;
    return was !== null && was !== now.orders.get(o.id);
  });
  const offRule = orders.filter(
    (o) =>
      o.handedOverAt !== null &&
      o.receivedOn !== null &&
      isoDay(o.receivedOn) !== instantToLocal(o.handedOverAt).day,
  );
  const movedLines = [...before.invoiceLines].filter(
    ([key, day]) => now.invoiceLines.has(key) && now.invoiceLines.get(key) !== day,
  );
  return {
    stillPending: orders.filter((o) => o.receivedOn === null).map((o) => o.orderNumber),
    movedDates: moved.map((o) => o.orderNumber),
    offSimpleRule: offRule.map((o) => o.orderNumber),
    movedInvoiceLines: movedLines.length,
    datedWithoutHandover: await datedWithoutHandover(prisma),
  };
}

/** Les contrôles « après » qui doivent rendre zéro sont-ils tous à zéro ? */
export function afterIsClean(after: AfterChecks): boolean {
  return (
    after.stillPending.length === 0 &&
    after.movedDates.length === 0 &&
    after.movedInvoiceLines === 0 &&
    after.datedWithoutHandover.length === 0
  );
}

/**
 * Contrôles « avant », puis — seulement si `apply` — une commande par
 * commande remise sans date, dans l'ordre de `created_at`, puis les contrôles
 * « après ». En simulation, rien n'est écrit et `after` vaut `null`.
 */
export async function runReceivedOnBackfill(
  deps: BackfillDeps,
  apply: boolean,
): Promise<BackfillReport> {
  const before = await readBefore(deps);
  printBefore(deps.log, before);
  if (!apply) {
    deps.log(
      `SIMULATION — rien n'est écrit. Avec --apply, ${String(before.pending.length)} commande(s) ` +
        `seraient datées, dont ${String(before.withoutHandover.length)} par le repli (jour de Paris de la remise).`,
    );
    return { before, dated: 0, after: null };
  }
  const reference = await snapshot(deps.prisma);
  for (const order of before.pending) {
    if (order.handedOverAt !== null) {
      await deps.commands.execute(new BackfillOrderReceivedOnCommand(order.id, order.handedOverAt));
    }
  }
  const after = await readAfter(deps.prisma, reference);
  printAfter(deps.log, after);
  return { before, dated: before.pending.length, after };
}

const listed = (numbers: readonly string[]): string =>
  numbers.length === 0 ? "" : ` — ${numbers.join(", ")}`;

function printBefore(log: (line: string) => void, before: BeforeChecks): void {
  log("AVANT");
  log(
    `  1. remises sans date de réception : ${String(before.pending.length)}${listed(before.pending.map((o) => o.orderNumber))}`,
  );
  log(
    `  2.   dont sans ligne order_handover (repli) : ${String(before.withoutHandover.length)}${listed(before.withoutHandover)}`,
  );
  log(
    `  3.   dont déjà sur une facture : ${String(before.onInvoice.length)}${listed(before.onInvoice)}`,
  );
  log(
    `  5. dates sans remise (non réparées, décision de Hugo) : ${String(before.datedWithoutHandover.length)}${listed(before.datedWithoutHandover)}`,
  );
}

function printAfter(log: (line: string) => void, after: AfterChecks): void {
  log("APRÈS");
  log(
    `  1. remises sans date (attendu 0) : ${String(after.stillPending.length)}${listed(after.stillPending)}`,
  );
  log(
    `  2. dates déjà posées qui ont bougé (attendu 0) : ${String(after.movedDates.length)}${listed(after.movedDates)}`,
  );
  log(
    `  3. écart à la règle simple (attendu : remises à la porte) : ${String(after.offSimpleRule.length)}${listed(after.offSimpleRule)}`,
  );
  log(`  4. lignes de facture qui ont bougé (attendu 0) : ${String(after.movedInvoiceLines)}`);
  log(
    `  5. dates sans remise (attendu 0) : ${String(after.datedWithoutHandover.length)}${listed(after.datedWithoutHandover)}`,
  );
}

/** Hôte, port et nom de la base — jamais l'utilisateur ni le mot de passe. */
export function describeTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port === "" ? "5432" : parsed.port}/${parsed.pathname.replace(/^\//, "")}`;
}
