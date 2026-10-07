import type { LoyaltyVoucher } from "../entities/loyalty-voucher.js";

/**
 * Port d'**écriture** des bons : charger l'agrégat, le sauver. Aucune écriture
 * ciblée — le statut ne bouge que par une méthode de {@link LoyaltyVoucher}.
 */
export abstract class LoyaltyVoucherRepository {
  abstract load(id: string): Promise<LoyaltyVoucher | null>;

  /** Les bons encore `available` dont la date limite est passée à `now`, par lot. */
  abstract loadDueForExpiry(now: Date, limit: number): Promise<readonly LoyaltyVoucher[]>;

  /**
   * Les bons `reserved` dont le reliquat n'est pas soldé
   * (`remainderSettledAt` nul), d'identifiant strictement supérieur à `after`,
   * par lot — ce que le rattrapage de nuit parcourt (plan C5, S4).
   */
  abstract loadReservedUnsettled(
    after: string | null,
    limit: number,
  ): Promise<readonly LoyaltyVoucher[]>;

  /**
   * Création ou mise à jour, selon que l'id existe pour ce titulaire ; un id déjà
   * pris par un autre est refusé, jamais réécrit (2026-10-07).
   */
  abstract save(voucher: LoyaltyVoucher): Promise<void>;
}
