import type { Prisma } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import type { InvoiceAutopilotOutcome } from "../domain/ports/invoice-autopilot-runs.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import {
  earliestPendingDay,
  parisDay,
  pendingOrderIsInCycle,
  type InvoicingProgress,
} from "../domain/services/pending-order-cycle.js";
import { accountOrderWhere, dayColumnOf } from "./billable-order-criterion.js";
import { ISSUED_OUTCOME } from "./prisma-monthly-invoice-outcomes.js";

/** `AAAA-MM-JJ`. */
const DAY_LENGTH = 10;

/** Le statut d'un bon annulé (`orders.status`). */
const CANCELLED_STATUS = "cancelled";

/** Une tentative close qui dit que la facture est passée à sa clôture. */
const PASSED_RUN_OUTCOMES: readonly InvoiceAutopilotOutcome[] = ["issued", "nothing_to_invoice"];

/**
 * **Les bons d'un cycle du relevé et du dossier : ceux que sa facture porte
 * ou portera** (décision de Hugo du 2026-10-22, « le relevé suit la
 * facture »). Partagé par `PrismaCycleOrdersReader` et
 * `PrismaInvoiceDossierReader` — une seule définition, sans quoi le relevé
 * et le dossier finiraient par ne plus montrer les mêmes bons.
 *
 * - **Déjà facturé** : le bon est au cycle de SA facture 380 — l'issue
 *   `issued` dont la clôture est celle du cycle. La pièce fait foi, quel que
 *   soit son jour de réception.
 * - **Pas encore facturé** : au cycle dont la facture le prendra
 *   (`pendingOrderIsInCycle`), qui applique la même assiette que la facture.
 *
 * `invoice_order` n'a pas de relation vers `orders` (l'id est opaque, comme
 * dans `PrismaMonthlyInvoicingReader`) : trois lectures du même bloc, jointes
 * en mémoire. Rien ne traverse une frontière — `invoice*` et `orders` sont
 * tous deux lus par la comptabilité depuis le lot E2.
 *
 * 🔴 Le mur : chaque lecture de `orders` porte `company_id` (ou le payeur
 * copié) parmi les sociétés demandées, et le lecteur qui rend les lignes le
 * repose avec les ids. La lecture des factures, elle, filtre par payeur.
 *
 * 🔴 **Un cycle déjà facturé montre EXACTEMENT les bons de sa facture**
 * (Hugo, 2026-10-22) — un bon annulé APRÈS l'émission compris : la pièce ne
 * bouge pas, le relevé non plus, et le lecteur le marque « annulé après
 * facturation » (l'avoir reste à émettre, lot ZB). D'où `cycleOrderWhere`,
 * qui n'applique `accountOrderWhere` qu'aux bons à venir.
 *
 * @returns les ids, sans ordre ; le lecteur relit et trie.
 */
export async function cycleOrderMembership(
  prisma: PrismaService,
  companyIds: readonly string[],
  cycle: BillingCycle,
): Promise<CycleOrderMembership> {
  const progress = await invoicingProgress(prisma);
  const [invoiced, pending] = await Promise.all([
    invoicedInCycle(prisma, companyIds, cycle),
    pendingInCycle(prisma, companyIds, cycle, progress),
  ]);
  return { invoiced, pending };
}

/** Les bons d'un cycle, selon que sa facture les porte déjà ou les portera. */
export interface CycleOrderMembership {
  /** Portés par la 380 émise du cycle — quel que soit leur statut aujourd'hui. */
  readonly invoiced: readonly string[];
  /** Pas encore facturés : l'assiette vivante (`accountOrderWhere`) s'y applique. */
  readonly pending: readonly string[];
}

/**
 * Le `where` de relecture des bons d'un cycle, mur compris : un bon facturé
 * reste lu même annulé depuis ; un bon à venir doit être encore au compte et
 * vivant.
 */
export function cycleOrderWhere(
  companyIds: readonly string[],
  membership: CycleOrderMembership,
): Prisma.OrderWhereInput {
  return {
    AND: [
      companyWallWhere(companyIds),
      {
        OR: [
          { id: { in: [...membership.invoiced] } },
          { AND: [accountOrderWhere(), { id: { in: [...membership.pending] } }] },
        ],
      },
    ],
  };
}

/** Un bon que la facture porte, et qui a été annulé depuis : l'avoir reste à émettre. */
export function isCancelledAfterInvoicing(
  membership: CycleOrderMembership,
  orderId: string,
  status: string,
): boolean {
  return status === CANCELLED_STATUS && membership.invoiced.includes(orderId);
}

/** Le mur : les bons de ces sociétés, ET ceux qu'elles paient (payeur copié, S4). */
export function companyWallWhere(companyIds: readonly string[]): Prisma.OrderWhereInput {
  return {
    OR: [{ companyId: { in: [...companyIds] } }, { billedCompanyId: { in: [...companyIds] } }],
  };
}

async function invoicingProgress(prisma: PrismaService): Promise<InvoicingProgress> {
  const [floor, outcome, run] = await Promise.all([
    prisma.invoicingFloor.findFirst({ where: { id: true }, select: { floorAt: true } }),
    prisma.invoiceMonthlyOutcome.findFirst({
      orderBy: { periodClosesAt: "desc" },
      select: { periodClosesAt: true },
    }),
    prisma.invoiceAutopilotRun.findFirst({
      where: { outcome: { in: [...PASSED_RUN_OUTCOMES] } },
      orderBy: { periodClosesAt: "desc" },
      select: { periodClosesAt: true },
    }),
  ]);
  return {
    floorDay: floor === null ? null : parisDay(floor.floorAt),
    lastRunClosure: latest(outcome?.periodClosesAt ?? null, run?.periodClosesAt ?? null),
  };
}

async function invoicedInCycle(
  prisma: PrismaService,
  companyIds: readonly string[],
  cycle: BillingCycle,
): Promise<readonly string[]> {
  const rows = await prisma.invoiceOrder.findMany({
    where: {
      invoiceType: COMMERCIAL_INVOICE,
      invoice: {
        payerCompanyId: { in: [...companyIds] },
        monthlyOutcome: { periodClosesAt: cycle.closesAt, outcome: ISSUED_OUTCOME },
      },
    },
    select: { orderId: true },
  });
  return rows.map((row) => row.orderId);
}

async function pendingInCycle(
  prisma: PrismaService,
  companyIds: readonly string[],
  cycle: BillingCycle,
  progress: InvoicingProgress,
): Promise<readonly string[]> {
  const rows = await prisma.order.findMany({
    where: {
      AND: [accountOrderWhere(), companyWallWhere(companyIds)],
      receivedOn: {
        gte: dayColumnOf(earliestPendingDay(cycle, progress)),
        lt: dayColumnOf(parisDay(cycle.closesAt)),
      },
    },
    select: { id: true, receivedOn: true },
  });
  const inCycle = rows.filter(
    (row) =>
      row.receivedOn !== null &&
      // `@db.Date` : minuit UTC, dont la date ISO EST le jour de Paris.
      pendingOrderIsInCycle(row.receivedOn.toISOString().slice(0, DAY_LENGTH), cycle, progress),
  );
  const invoiced = await prisma.invoiceOrder.findMany({
    where: { invoiceType: COMMERCIAL_INVOICE, orderId: { in: inCycle.map((row) => row.id) } },
    select: { orderId: true },
  });
  const taken = new Set(invoiced.map((row) => row.orderId));
  return inCycle.filter((row) => !taken.has(row.id)).map((row) => row.id);
}

function latest(left: Date | null, right: Date | null): Date | null {
  if (left === null || right === null) {
    return left ?? right;
  }
  return left.getTime() >= right.getTime() ? left : right;
}
