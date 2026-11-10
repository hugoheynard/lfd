import type { LoyaltyHolderKind } from "../value-objects/loyalty-holder.js";
import type { LoyaltyVoucherStatus } from "../entities/loyalty-voucher.js";

/** Un titulaire et son nom, pour l'écran. */
export interface LoyaltyHolderRow {
  readonly kind: LoyaltyHolderKind;
  readonly id: string;
  /** `null` : une personne sans nom au profil. */
  readonly label: string | null;
}

/** Le solde d'un titulaire. */
export interface LoyaltyBalanceRow {
  readonly holder: LoyaltyHolderRow;
  readonly points: number;
}

/** Un bon tel que la base le range, avec le nom de son titulaire. */
export interface LoyaltyVoucherRow {
  readonly id: string;
  readonly holder: LoyaltyHolderRow;
  readonly valueCents: number;
  readonly pointsCost: number;
  readonly ratioPointsPerStep: number;
  readonly ratioStepValueCents: number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /** L'état ÉCRIT ; l'état lu à l'horloge est le travail de la requête. */
  readonly status: LoyaltyVoucherStatus;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
}

/** Port de **lecture** de la comptabilité : les soldes et les bons. */
export abstract class LoyaltyLedgerReader {
  /** Un solde par titulaire qui a au moins une ligne, du plus grand au plus petit. */
  abstract listBalances(): Promise<readonly LoyaltyBalanceRow[]>;

  /** Les bons, du plus récent au plus ancien. */
  abstract listVouchers(): Promise<readonly LoyaltyVoucherRow[]>;
}
