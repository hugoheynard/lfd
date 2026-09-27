import type { LoyaltyEntryKind } from "../entities/loyalty-account.js";
import type { LoyaltyVoucherStatus } from "../entities/loyalty-voucher.js";
import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";

/** Une ligne du livre, vue par son titulaire : sans auteur ni motif. */
export interface HolderEntryRow {
  readonly id: string;
  readonly kind: LoyaltyEntryKind;
  readonly points: number;
  readonly occurredAt: Date;
  /** La commande d'un gain — un identifiant opaque, que la commande nomme. */
  readonly orderId: string | null;
}

/** Un bon, vu par son titulaire : sans ratio ni motif d'annulation. */
export interface HolderVoucherRow {
  readonly id: string;
  readonly valueCents: number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /** L'état ÉCRIT ; l'état lu à l'horloge est le travail de la requête. */
  readonly status: LoyaltyVoucherStatus;
}

/**
 * Port de **lecture** de l'espace d'un titulaire (plan des points, E1.1) : son
 * solde, ses bons, son historique. Toute lecture porte le titulaire dans son
 * `where` — c'est le mur de ce port.
 *
 * À part de {@link LoyaltyLedgerReader}, qui lit TOUS les titulaires pour la
 * comptabilité : un client ne dépend pas d'une lecture qui ne le filtre pas.
 */
export abstract class HolderLoyaltyReader {
  /** La somme du livre — lue sans verrou : un affichage, pas une décision. */
  abstract balanceOf(holder: LoyaltyHolder): Promise<number>;

  /** Les `limit` dernières lignes, de la plus récente à la plus ancienne. */
  abstract recentEntries(holder: LoyaltyHolder, limit: number): Promise<readonly HolderEntryRow[]>;

  /** Tous les bons écrits `available` ou `reserved`. */
  abstract liveVouchers(holder: LoyaltyHolder): Promise<readonly HolderVoucherRow[]>;

  /** Les `limit` derniers bons écrits `expired` ou `cancelled`, du plus récent au plus ancien. */
  abstract recentClosedVouchers(
    holder: LoyaltyHolder,
    limit: number,
  ): Promise<readonly HolderVoucherRow[]>;
}
