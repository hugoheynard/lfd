import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";
import type { OrderVoucher } from "../../../domain/entities/order.js";
import { LoyaltyVoucherQuoteReader } from "../../../domain/ports/loyalty-voucher-quote.reader.js";
import {
  LoyaltyVoucherRedemption,
  type VoucherSettlement,
} from "../../../domain/ports/loyalty-voucher-redemption.js";

/**
 * Doubles des deux ports du bon de fidélité, écrits à la main en héritant des
 * ports — jamais `jest.fn()`. La fidélité elle-même est éprouvée de son côté ;
 * ici on vérifie ce que la commande DEMANDE, et dans quel ordre.
 */

/** Un refus de la fidélité, tel que la réservation le lèverait sur une course perdue. */
export class VoucherTakenError extends BusinessError {
  constructor() {
    super("test.voucher_taken", "Ce bon de fidélité a déjà servi sur une autre commande.");
  }
}

/** Les bons connus, par identifiant, pour un seul titulaire. */
export class FixedVoucherQuotes extends LoyaltyVoucherQuoteReader {
  readonly asked: string[] = [];

  constructor(
    private readonly vouchers: Readonly<Record<string, number>> = {},
    private readonly holderUserId = "u1",
  ) {
    super();
  }

  quote(voucherId: string, holderUserId: string): Promise<OrderVoucher> {
    this.asked.push(`${voucherId}>${holderUserId}`);
    const valueCents = this.vouchers[voucherId];
    if (valueCents === undefined || holderUserId !== this.holderUserId) {
      return Promise.reject(new VoucherTakenError());
    }
    return Promise.resolve({ id: voucherId, valueCents });
  }
}

/** Enregistre chaque geste ; `reserve` peut perdre la course. */
export class RecordingRedemption extends LoyaltyVoucherRedemption {
  readonly calls: string[] = [];
  readonly settlements: VoucherSettlement[] = [];

  constructor(private readonly reserveFails = false) {
    super();
  }

  reserve(voucherId: string, holderUserId: string): Promise<void> {
    this.calls.push(`reserve:${voucherId}>${holderUserId}`);
    return this.reserveFails ? Promise.reject(new VoucherTakenError()) : Promise.resolve();
  }

  release(voucherId: string): Promise<void> {
    this.calls.push(`release:${voucherId}`);
    return Promise.resolve();
  }

  settleRemainder(settlement: VoucherSettlement): Promise<void> {
    this.calls.push(`settle:${settlement.voucherId}`);
    this.settlements.push(settlement);
    return Promise.resolve();
  }
}
