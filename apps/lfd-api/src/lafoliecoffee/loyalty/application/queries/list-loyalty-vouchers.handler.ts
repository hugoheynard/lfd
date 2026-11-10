import type { LoyaltyVoucherView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  VoucherOrderReader,
  type VoucherOrder,
} from "../../../orders/domain/ports/voucher-order.reader.js";
import { voucherStatusAt } from "../../domain/entities/loyalty-voucher.js";
import {
  LoyaltyLedgerReader,
  type LoyaltyVoucherRow,
} from "../../domain/ports/loyalty-ledger.reader.js";
import { ListLoyaltyVouchersQuery } from "./list-loyalty-vouchers.query.js";

/**
 * Les bons, avec leur état **lu à l'horloge** : un bon disponible dont la date
 * limite est passée se lit `expired`, même si le passage qui l'écrit n'est pas
 * encore venu. L'écran ne propose donc jamais d'annuler un bon qui le refuserait.
 *
 * Un bon `reserved` porte la commande vivante qui l'engage (plan des points,
 * §11 bis S6) : faute d'état `used`, c'est elle qui dit « utilisé sur … ». Lue
 * par le port de la commande, pour les seuls bons réservés.
 */
@QueryHandler(ListLoyaltyVouchersQuery)
export class ListLoyaltyVouchersHandler implements IQueryHandler<
  ListLoyaltyVouchersQuery,
  readonly LoyaltyVoucherView[]
> {
  constructor(
    private readonly ledger: LoyaltyLedgerReader,
    private readonly clock: Clock,
    private readonly orders: VoucherOrderReader,
  ) {}

  async execute(): Promise<readonly LoyaltyVoucherView[]> {
    const now = this.clock.now();
    const rows = await this.ledger.listVouchers();
    const carriers = await this.orders.liveOrdersCarrying(
      rows.filter((row) => row.status === "reserved").map((row) => row.id),
    );
    return rows.map((row) => toView(row, now, carriers.get(row.id)));
  }
}

function toView(
  row: LoyaltyVoucherRow,
  now: Date,
  order: VoucherOrder | undefined,
): LoyaltyVoucherView {
  return {
    id: row.id,
    holder: { ...row.holder },
    valueCents: row.valueCents,
    pointsCost: row.pointsCost,
    ratio: { pointsPerStep: row.ratioPointsPerStep, stepValueCents: row.ratioStepValueCents },
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: voucherStatusAt(row.status, row.expiresAt, now),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    usedOn:
      row.status === "reserved" && order !== undefined
        ? { orderId: order.orderId, orderNumber: order.orderNumber }
        : null,
  };
}
