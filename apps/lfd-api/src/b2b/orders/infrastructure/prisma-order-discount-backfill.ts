import { Prisma, type PrismaClient } from "../../../platform/database/client/client.js";
import type { IdGenerator } from "../../../platform/id/id-generator.js";
import type { Clock } from "../../../platform/time/clock.js";
import type { OrderDiscountRecovery } from "../domain/services/order-discount-recovery-shapes.js";
import { recoverOrderDiscount } from "../domain/services/order-discount-recovery.js";
import {
  BACKFILL_ORDER_SELECT,
  frozenTraceOf,
  orderDiscountData,
  toRecoveryOrder,
} from "./order-discount-backfill.rows.js";

/** Le sort d'une commande dans une passe. */
export type BackfillOutcome =
  | { readonly kind: "computed" | "frozen"; readonly gap: string | null }
  | { readonly kind: "undecided"; readonly reason: string }
  /** Une autre passe l'a reprise entre la liste et l'écriture. */
  | { readonly kind: "already" }
  /** Désaccord sur une commande devenue sans remise : ses remises archivées, rien d'autre. */
  | { readonly kind: "archived" }
  /** Ses colonnes figées sont illisibles : rien n'est écrit. */
  | { readonly kind: "unreadable"; readonly reason: string };

/** Une ligne du rapport. */
export interface BackfillReportLine {
  readonly orderNumber: string;
  readonly outcome: BackfillOutcome;
}

/**
 * Une commande dont les remises ACTIVES ne somment plus `discount_cents` —
 * révisée par l'ancien code après sa reprise (entre les temps 2 et 3 du
 * runbook, § 18.3). La reprise saute une commande qui a des lignes : elle la
 * signale, elle ne la réécrit pas.
 */
export interface DriftedOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly discountCents: number;
  readonly activeCents: number;
}

/**
 * **La reprise des remises de panier** (plan des promotions, § 18.3, M2) :
 * l'adaptateur que le script `prisma/backfill-order-discounts.ts` conduit.
 * Une commande à la fois, dans sa transaction ; rejouable — une commande qui
 * a une remise non archivée est sautée, et l'index partiel `(order_id, rank)
 * WHERE archived_at IS NULL` refuse une seconde écriture concurrente.
 *
 * Écrit à côté des colonnes `discount_*`, qu'il ne touche pas. Personne ne lit
 * encore ces tables (M2) ; la passation et la révision les écriront en M3.
 */
export class PrismaOrderDiscountBackfill {
  constructor(
    /**
     * Un client nu, pas le `PrismaService` de l'application : le script ne
     * démarre pas l'`AppModule`, dont les tâches de fond tourneraient contre
     * la base visée — la production comprise.
     */
    private readonly prisma: PrismaClient,
    private readonly ids: IdGenerator,
    /** L'instant d'archivage d'une remise périmée (`--refresh-drifted`, M3). */
    private readonly clock: Clock,
  ) {}

  /** Les commandes remisées sans remise active, dans l'ordre de passation. */
  async pendingOrderIds(): Promise<readonly string[]> {
    const rows = await this.prisma.order.findMany({
      where: { discountCents: { gt: 0 }, discounts: { none: { archivedAt: null } } },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => row.id);
  }

  /**
   * Juge une commande et, si `write`, écrit sa remise dans la même
   * transaction que la relecture. À blanc, rien n'est écrit et le verdict est
   * le même.
   */
  async recover(orderId: string, write: boolean): Promise<BackfillReportLine> {
    return this.rewrite(orderId, write, "pending");
  }

  /**
   * **`--refresh-drifted`** (décision sur le rapport de M2, 2026-10-30) : une
   * commande dont les remises actives ne somment plus `discount_cents` voit
   * ces remises ARCHIVÉES, puis est reprise comme une commande sans ligne —
   * dans la même transaction, et seulement si la reprise écrit une ligne : une
   * commande « à trancher » garde ses remises périmées, listées. Le désaccord
   * est relu sous la transaction : une commande corrigée entre-temps est sautée.
   */
  async refresh(orderId: string, write: boolean): Promise<BackfillReportLine> {
    return this.rewrite(orderId, write, "drifted");
  }

  private async rewrite(
    orderId: string,
    write: boolean,
    expected: "pending" | "drifted",
  ): Promise<BackfillReportLine> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          ...BACKFILL_ORDER_SELECT,
          discounts: { where: { archivedAt: null }, select: { id: true, amountCents: true } },
        },
      });
      if (stateOf(row) !== expected) {
        return { orderNumber: row.orderNumber, outcome: { kind: "already" } };
      }
      const archive = async (): Promise<void> => {
        await tx.orderDiscount.updateMany({
          where: { orderId: row.id, archivedAt: null },
          data: { archivedAt: this.clock.now() },
        });
      };
      if (row.discountCents === 0) {
        // Révisée sans remise par l'ancien code : il n'y a rien à reprendre.
        if (write) {
          await archive();
        }
        return { orderNumber: row.orderNumber, outcome: { kind: "archived" } };
      }
      const recovery = judged(row);
      if (recovery.kind !== "recovered") {
        return { orderNumber: row.orderNumber, outcome: recovery.outcome };
      }
      if (write) {
        await archive();
        await tx.orderDiscount.create({
          data: orderDiscountData(row.id, recovery.discount, frozenTraceOf(row), () =>
            this.ids.next(),
          ),
        });
      }
      return {
        orderNumber: row.orderNumber,
        outcome: { kind: recovery.discount.origin, gap: recovery.gap },
      };
    });
  }

  /** Les commandes dont les remises actives ne somment plus `discount_cents`. */
  async drifted(): Promise<readonly DriftedOrder[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; order_number: string; discount_cents: number; active_cents: bigint }[]
    >(Prisma.sql`
      SELECT o.id, o.order_number, o.discount_cents, coalesce(sum(d.amount_cents), 0) AS active_cents
        FROM public.order_discounts d
        JOIN public.orders o ON o.id = d.order_id
       WHERE d.archived_at IS NULL
       GROUP BY o.id, o.order_number, o.discount_cents
      HAVING coalesce(sum(d.amount_cents), 0) <> o.discount_cents
       ORDER BY o.order_number`);
    return rows.map((row) => ({
      orderId: row.id,
      orderNumber: row.order_number,
      discountCents: row.discount_cents,
      activeCents: Number(row.active_cents),
    }));
  }
}

/**
 * Où en est la commande : sans remise active (`pending`, à reprendre), à
 * remises actives qui somment `discount_cents` (`settled`), ou qui ne la
 * somment plus (`drifted`).
 */
function stateOf(row: {
  readonly discountCents: number;
  readonly discounts: readonly { readonly amountCents: number }[];
}): "pending" | "settled" | "drifted" {
  if (row.discounts.length === 0) {
    return row.discountCents > 0 ? "pending" : "settled";
  }
  const active = row.discounts.reduce((sum, discount) => sum + discount.amountCents, 0);
  return active === row.discountCents ? "settled" : "drifted";
}

type Judged =
  | Extract<OrderDiscountRecovery, { readonly kind: "recovered" }>
  | { readonly kind: "refused"; readonly outcome: BackfillOutcome };

/** Le verdict du domaine ; une colonne figée illisible n'arrête pas la passe. */
function judged(row: Parameters<typeof toRecoveryOrder>[0]): Judged {
  let recovery: OrderDiscountRecovery;
  try {
    recovery = recoverOrderDiscount(toRecoveryOrder(row));
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: "refused", outcome: { kind: "unreadable", reason } };
  }
  return recovery.kind === "recovered"
    ? recovery
    : { kind: "refused", outcome: { kind: "undecided", reason: recovery.reason } };
}
