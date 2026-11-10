import { Injectable } from "@nestjs/common";

import type { OrderVoucher } from "../../../orders/domain/entities/order.js";
import { LoyaltyVoucherQuoteReader } from "../../../orders/domain/ports/loyalty-voucher-quote.reader.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { loadOwnedVoucher } from "./owned-voucher.js";

/**
 * La fidélité répond à la commande : **que vaut ce bon ?** (plan des points,
 * C3 étape 1). Implémente le port de lecture que la commande déclare ; relié
 * dans `appBootstrap/loyalty-voucher.module.ts`.
 *
 * N'engage rien, ne prend aucun verrou : c'est la réservation qui tranche.
 * La règle d'usage est celle de l'agrégat ({@link LoyaltyVoucher.ensureUsableAt}),
 * pas une copie.
 */
@Injectable()
export class LoyaltyVoucherQuoting extends LoyaltyVoucherQuoteReader {
  constructor(private readonly vouchers: LoyaltyVoucherRepository) {
    super();
  }

  async quote(voucherId: string, holderUserId: string, now: Date): Promise<OrderVoucher> {
    const voucher = await loadOwnedVoucher(this.vouchers, voucherId, holderUserId);
    voucher.ensureUsableAt(now);
    return { id: voucher.id, valueCents: voucher.valueCents };
  }
}
