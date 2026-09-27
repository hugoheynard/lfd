import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import type { LoyaltyVoucher } from "./loyalty-voucher.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

// Les formes et la lecture d'état du bon, sorties de `loyalty-voucher.ts` pour
// le garder lisible — aucune transition ici. L'agrégat les réexporte.

/**
 * Les états d'un bon (plan D7). `reserved` : engagé sur une commande vivante,
 * depuis le lot C. Il n'y a pas d'état `used` — un bon réservé sur une commande
 * qui vit EST consommé, et n'en revient que par l'annulation de la commande.
 */
export type LoyaltyVoucherStatus = "available" | "expired" | "cancelled" | "reserved";

/**
 * L'état d'un bon **lu à cet instant** : disponible mais passé sa date limite,
 * il se lit `expired`. Une fonction à part pour que l'agrégat et la lecture de
 * l'écran disent la même chose.
 */
export function voucherStatusAt(
  status: LoyaltyVoucherStatus,
  expiresAt: Date,
  now: Date,
): LoyaltyVoucherStatus {
  return status === "available" && now.getTime() >= expiresAt.getTime() ? "expired" : status;
}

/** L'agrégat tel que la base le range. */
export interface LoyaltyVoucherSnapshot {
  readonly id: string;
  readonly companyId: string | null;
  readonly userId: string | null;
  readonly valueCents: number;
  readonly pointsCost: number;
  readonly ratioPointsPerStep: number;
  readonly ratioStepValueCents: number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: LoyaltyVoucherStatus;
  readonly parentVoucherId: string | null;
  /** Le reliquat de ce bon est soldé — émis, éteint, ou rien à émettre (lot C). */
  readonly remainderSettledAt: Date | null;
  readonly expiredAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
  readonly cancellationReason: string | null;
}

/** Ce qu'il faut pour émettre un bon — les paliers ont déjà été payés en points. */
export interface LoyaltyVoucherIssue {
  readonly id: string;
  readonly holder: LoyaltyHolder;
  readonly steps: number;
  readonly settings: LoyaltySettings;
  readonly issuedAt: Date;
}

/**
 * Ce que laisse un bon consommé sur une commande (plan C5, §11 bis B2) :
 * - `settled` : déjà soldé — rien n'est refait ;
 * - `none` : il a tout imputé ;
 * - `issued` : un reliquat, nouveau bon du même titulaire ;
 * - `lapsed` : il restait `remainderCents`, mais sa date limite était passée
 *   à l'émission — le reliquat s'éteint, comme l'aurait fait le bon inutilisé.
 */
export type VoucherRemainder =
  | { readonly kind: "none" }
  | { readonly kind: "settled" }
  | { readonly kind: "issued"; readonly voucher: LoyaltyVoucher }
  | { readonly kind: "lapsed"; readonly remainderCents: number };
