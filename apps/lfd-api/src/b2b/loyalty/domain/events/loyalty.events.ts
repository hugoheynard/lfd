import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { LoyaltyVoucher } from "../entities/loyalty-voucher.js";
import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

export const LOYALTY_SETTINGS_SET = "loyalty_settings.set" satisfies JournalFactType;
export const LOYALTY_POINTS_EARNED = "loyalty.points_earned" satisfies JournalFactType;
export const LOYALTY_POINTS_ADJUSTED = "loyalty.points_adjusted" satisfies JournalFactType;
export const LOYALTY_VOUCHER_ISSUED = "loyalty.voucher_issued" satisfies JournalFactType;
export const LOYALTY_VOUCHER_EXPIRED = "loyalty.voucher_expired" satisfies JournalFactType;
export const LOYALTY_VOUCHER_CANCELLED = "loyalty.voucher_cancelled" satisfies JournalFactType;
export const LOYALTY_VOUCHER_REMAINDER_ISSUED =
  "loyalty.voucher_remainder_issued" satisfies JournalFactType;
export const LOYALTY_VOUCHER_REMAINDER_LAPSED =
  "loyalty.voucher_remainder_lapsed" satisfies JournalFactType;

/** Le nom du réglage, seul libellé qu'une ligne unique puisse porter. */
const SETTINGS_LABEL = "Programme de fidélité";

/** Un titulaire cité : le sujet du fait, et son nom au moment du fait. */
export interface NamedHolder {
  readonly holder: LoyaltyHolder;
  /** `null` : une personne sans nom au profil — omis plutôt qu'inventé. */
  readonly label: string | null;
}

/** Le nom d'un bon : son montant — il n'en a pas d'autre. */
function voucherName(voucher: LoyaltyVoucher): { id: string; name: string } {
  const amount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    voucher.valueCents / 100,
  );
  return { id: voucher.id, name: `Bon de ${amount}` };
}

function onHolder(
  type: JournalFactType,
  named: NamedHolder,
  payload: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: named.holder.kind,
    subjectId: named.holder.id,
    payload: named.label === null ? payload : { subjectLabel: named.label, ...payload },
  };
}

/** Le comptable a posé le réglage du programme — le ratio borne de l'argent. */
export class LoyaltySettingsSetEvent implements JournaledEvent {
  constructor(readonly settings: LoyaltySettings) {}

  journalFact(): JournalFact {
    return {
      type: LOYALTY_SETTINGS_SET,
      subjectType: "loyalty_settings",
      subjectId: "default",
      payload: { subjectLabel: SETTINGS_LABEL, ...this.settings.toInput() },
    };
  }
}

/**
 * Une commande remise et réglée a rapporté des points. Pas un geste humain :
 * la trace dit quelle commande, pour que le titulaire qui conteste un solde
 * puisse relire d'où vient chaque gain.
 */
export class LoyaltyPointsEarnedEvent implements JournaledEvent {
  constructor(
    readonly named: NamedHolder,
    readonly points: number,
    readonly order: { readonly id: string; readonly number: string },
  ) {}

  journalFact(): JournalFact {
    return onHolder(LOYALTY_POINTS_EARNED, this.named, {
      points: this.points,
      order: { id: this.order.id, name: this.order.number },
    });
  }
}

/** Un geste motivé du staff sur le livre ; `voucher` quand c'est une annulation qui recrédite. */
export class LoyaltyPointsAdjustedEvent implements JournaledEvent {
  constructor(
    readonly named: NamedHolder,
    readonly points: number,
    readonly reason: string,
    readonly voucher: LoyaltyVoucher | null,
  ) {}

  journalFact(): JournalFact {
    return onHolder(LOYALTY_POINTS_ADJUSTED, this.named, {
      points: this.points,
      reason: this.reason,
      voucher: this.voucher === null ? null : voucherName(this.voucher),
    });
  }
}

/** Des points convertis en bon. */
export class LoyaltyVoucherIssuedEvent implements JournaledEvent {
  constructor(
    readonly named: NamedHolder,
    readonly voucher: LoyaltyVoucher,
  ) {}

  journalFact(): JournalFact {
    return onHolder(LOYALTY_VOUCHER_ISSUED, this.named, {
      voucher: voucherName(this.voucher),
      valueCents: this.voucher.valueCents,
      pointsCost: this.voucher.pointsCost,
      expiresAt: this.voucher.expiresAt.toISOString(),
    });
  }
}

/** Un bon disponible a passé sa date limite. */
export class LoyaltyVoucherExpiredEvent implements JournaledEvent {
  constructor(
    readonly named: NamedHolder,
    readonly voucher: LoyaltyVoucher,
  ) {}

  journalFact(): JournalFact {
    return onHolder(LOYALTY_VOUCHER_EXPIRED, this.named, {
      voucher: voucherName(this.voucher),
      valueCents: this.voucher.valueCents,
    });
  }
}

/** Le staff a annulé un bon ; le recrédit est un fait à part (`points_adjusted`). */
export class LoyaltyVoucherCancelledEvent implements JournaledEvent {
  constructor(
    readonly named: NamedHolder,
    readonly voucher: LoyaltyVoucher,
  ) {}

  journalFact(): JournalFact {
    return onHolder(LOYALTY_VOUCHER_CANCELLED, this.named, {
      voucher: voucherName(this.voucher),
      valueCents: this.voucher.valueCents,
      pointsCost: this.voucher.pointsCost,
      reason: this.voucher.cancellationReason ?? "",
    });
  }
}

/** La commande sur laquelle un bon a servi : son identifiant et son numéro. */
export interface VoucherOrderRef {
  readonly id: string;
  readonly number: string;
}

/** Le reliquat d'un bon consommé, émis quand la commande devient définitive (plan C5). */
export class LoyaltyVoucherRemainderIssuedEvent implements JournaledEvent {
  constructor(
    readonly named: NamedHolder,
    readonly remainder: LoyaltyVoucher,
    readonly parent: LoyaltyVoucher,
    readonly order: VoucherOrderRef,
  ) {}

  journalFact(): JournalFact {
    return onHolder(LOYALTY_VOUCHER_REMAINDER_ISSUED, this.named, {
      voucher: voucherName(this.remainder),
      parent: voucherName(this.parent),
      order: { id: this.order.id, name: this.order.number },
      valueCents: this.remainder.valueCents,
      expiresAt: this.remainder.expiresAt.toISOString(),
    });
  }
}

/**
 * Un reliquat qui ne naît pas : le bon d'origine était échu quand la commande
 * est devenue définitive (§11 bis B2). La trace dit ce qui s'est perdu.
 */
export class LoyaltyVoucherRemainderLapsedEvent implements JournaledEvent {
  constructor(
    readonly named: NamedHolder,
    readonly parent: LoyaltyVoucher,
    readonly order: VoucherOrderRef,
    readonly remainderCents: number,
  ) {}

  journalFact(): JournalFact {
    return onHolder(LOYALTY_VOUCHER_REMAINDER_LAPSED, this.named, {
      voucher: voucherName(this.parent),
      order: { id: this.order.id, name: this.order.number },
      remainderCents: this.remainderCents,
    });
  }
}
