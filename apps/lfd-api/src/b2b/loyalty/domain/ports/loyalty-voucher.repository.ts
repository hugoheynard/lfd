import type { LoyaltyVoucher } from "../entities/loyalty-voucher.js";

/**
 * Port d'**écriture** des bons : charger l'agrégat, le sauver. Aucune écriture
 * ciblée — le statut ne bouge que par une méthode de {@link LoyaltyVoucher}.
 */
export abstract class LoyaltyVoucherRepository {
  abstract load(id: string): Promise<LoyaltyVoucher | null>;

  /** Les bons encore `available` dont la date limite est passée à `now`, par lot. */
  abstract loadDueForExpiry(now: Date, limit: number): Promise<readonly LoyaltyVoucher[]>;

  /** Création ou mise à jour, selon que l'id existe. */
  abstract save(voucher: LoyaltyVoucher): Promise<void>;
}
