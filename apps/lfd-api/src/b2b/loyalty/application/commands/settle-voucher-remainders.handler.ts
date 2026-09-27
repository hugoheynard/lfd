import { instantToLocal } from "@lfd/contracts";
import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  VoucherOrderReader,
  type VoucherOrder,
} from "../../../orders/domain/ports/voucher-order.reader.js";
import type { LoyaltyVoucher } from "../../domain/entities/loyalty-voucher.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { LoyaltyVoucherRedeeming } from "../services/loyalty-voucher-redeeming.js";
import {
  SettleVoucherRemaindersCommand,
  type VoucherRemaindersReport,
} from "./settle-voucher-remainders.command.js";

/** Un lot lu d'un coup : une lecture reste courte, et chaque reliquat a sa transaction. */
export const REMAINDER_BATCH = 200;

/** Les règlements qui laissent la commande en suspens — ni encaissée, ni close. */
const UNSETTLED = new Set(["pending", "failed"]);

/**
 * Parcourt les bons `reserved` dont le reliquat n'est pas soldé
 * (`remainder_settled_at` nul), lit leur commande vivante par le port de la
 * commande, et fait l'une des deux choses (plan des points, C5, S4).
 *
 * Une commande payée solde le bon dans tous les cas — reliquat émis, reliquat
 * éteint si le bon est échu (§11 bis B2, fait journalisé une fois), ou rien à
 * émettre — et la marque le sort du parcours : une commande soldée n'est plus
 * jamais relue (décision du 2026-09-27).
 *
 * `@hors-transaction` le passage entier : chaque reliquat ouvre SA
 * transaction dans `LoyaltyVoucherRedeeming.settleRemainder`, et y trace son
 * fait. Un échec n'en emporte qu'un ; le passage suivant le reprend.
 */
@CommandHandler(SettleVoucherRemaindersCommand)
export class SettleVoucherRemaindersHandler implements ICommandHandler<
  SettleVoucherRemaindersCommand,
  VoucherRemaindersReport
> {
  private readonly logger = new Logger(SettleVoucherRemaindersHandler.name);

  constructor(
    private readonly vouchers: LoyaltyVoucherRepository,
    private readonly orders: VoucherOrderReader,
    private readonly redeeming: LoyaltyVoucherRedeeming,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<VoucherRemaindersReport> {
    const now = this.clock.now();
    let after: string | null = null;
    let report: VoucherRemaindersReport = { reserved: 0, settled: 0, stalled: 0 };
    do {
      const page = await this.vouchers.loadReservedUnsettled(after, REMAINDER_BATCH);
      const carriers = await this.orders.liveOrdersCarrying(page.map((voucher) => voucher.id));
      for (const voucher of page) {
        report = await this.visit(voucher, carriers.get(voucher.id), now, report);
      }
      after = page.length === REMAINDER_BATCH ? (page.at(-1)?.id ?? null) : null;
    } while (after !== null);
    return report;
  }

  private async visit(
    voucher: LoyaltyVoucher,
    order: VoucherOrder | undefined,
    now: Date,
    report: VoucherRemaindersReport,
  ): Promise<VoucherRemaindersReport> {
    const seen = { ...report, reserved: report.reserved + 1 };
    if (order === undefined) {
      // Réservé sans commande vivante : la réservation en transaction le rend
      // impossible. On le dit au journal applicatif, sans rien écrire.
      this.logger.warn(`Bon ${voucher.id} réservé sans commande vivante : à examiner.`);
      return seen;
    }
    if (order.paymentStatus === "paid") {
      await this.redeeming.settleRemainder(
        {
          voucherId: voucher.id,
          appliedCents: order.voucherDiscountCents,
          order: { id: order.orderId, number: order.orderNumber },
        },
        now,
      );
      return { ...seen, settled: seen.settled + 1 };
    }
    if (this.isStalled(order, now)) {
      await this.ring(order, now);
      return { ...seen, stalled: seen.stalled + 1 };
    }
    return seen;
  }

  /** Ni payée ni annulée, et son jour de service est passé (à l'heure de Paris). */
  private isStalled(order: VoucherOrder, now: Date): boolean {
    return (
      UNSETTLED.has(order.paymentStatus) &&
      order.serviceDay !== null &&
      order.serviceDay < instantToLocal(now).day
    );
  }

  /** Une clé par bon et par commande : la cloche ne sonne qu'une fois pour un même suspens. */
  private async ring(order: VoucherOrder, now: Date): Promise<void> {
    await this.notifier.notify([
      {
        kind: "loyalty.voucher_stalled",
        subject: `Bon de fidélité en suspens — ${order.orderNumber}`,
        body:
          `La commande ${order.orderNumber} porte un bon de fidélité, mais n'est ni payée ni annulée ` +
          `alors que son jour de service (${order.serviceDay ?? "—"}) est passé. Le bon reste engagé ` +
          "tant que la commande vit : à relancer auprès du client pour le règlement.",
        link: `/commandes/${order.orderId}`,
        idempotencyKey: `notification:loyalty.voucher_stalled:${order.voucherId}:${order.orderId}`,
        occurredAt: now,
      },
    ]);
  }
}
