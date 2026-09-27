import type { LoyaltyVoucher } from "../../domain/entities/loyalty-voucher.js";
import { LoyaltyVoucherUnknownError } from "../../domain/errors/loyalty-errors.js";
import type { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { LoyaltyHolder } from "../../domain/value-objects/loyalty-holder.js";

/**
 * Le bon, s'il appartient à cette personne — **le mur du bon** (plan des
 * points, lot C). Un bon d'autrui se lit comme un bon inexistant : dire « ce
 * bon est à quelqu'un d'autre » confirmerait qu'il existe.
 *
 * @throws {LoyaltyVoucherUnknownError} absent, ou d'un autre titulaire.
 */
export async function loadOwnedVoucher(
  vouchers: LoyaltyVoucherRepository,
  voucherId: string,
  holderUserId: string,
): Promise<LoyaltyVoucher> {
  const voucher = await vouchers.load(voucherId);
  if (voucher === null || !voucher.holder.equals(LoyaltyHolder.of("user", holderUserId))) {
    throw new LoyaltyVoucherUnknownError(voucherId);
  }
  return voucher;
}
