import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { LoyaltyVoucher } from "../entities/loyalty-voucher.js";
import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

export const LOYALTY_SETTINGS_SET = "loyalty_settings.set" satisfies JournalFactType;
export const LOYALTY_POINTS_ADJUSTED = "loyalty.points_adjusted" satisfies JournalFactType;
export const LOYALTY_VOUCHER_ISSUED = "loyalty.voucher_issued" satisfies JournalFactType;
export const LOYALTY_VOUCHER_EXPIRED = "loyalty.voucher_expired" satisfies JournalFactType;
export const LOYALTY_VOUCHER_CANCELLED = "loyalty.voucher_cancelled" satisfies JournalFactType;

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
