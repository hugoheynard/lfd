import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";
import { BILLING_MODE_LABELS, type BillingMode } from "../value-objects/billing-mode.js";
import { parisLongDay } from "./collection-errors.js";

/**
 * **Un seul changement de dates à la fois, par mode** (plan
 * `plan-rythme-de-facturation.md`, §16.6-2) : un segment programmé n'a pas
 * encore pris effet. 409 : l'état de l'entité, que la comptabilité peut
 * attendre ou défaire. Le message nomme la prise d'effet et le geste.
 */
export class BillingModeDatesChangePendingError extends BusinessError {
  constructor(
    readonly mode: BillingMode,
    readonly effectiveAt: Date,
  ) {
    super(
      "accounting.billing_mode_dates.change_pending",
      `Un changement des dates du mode ${BILLING_MODE_LABELS[mode]} est déjà programmé : il prend ` +
        `effet le ${parisLongDay(effectiveAt)} à 00h00 (heure de Paris). Un seul changement à la ` +
        `fois : attendez cette date, ou annulez d'abord le changement programmé.`,
    );
  }
}

/** Aucun changement de dates programmé à annuler pour ce mode. */
export class NoScheduledBillingModeDatesError extends BusinessError {
  constructor(readonly mode: BillingMode) {
    super(
      "accounting.billing_mode_dates.nothing_scheduled",
      `Aucun changement des dates du mode ${BILLING_MODE_LABELS[mode]} n'est programmé : il n'y a ` +
        `rien à annuler. Un changement qui a déjà pris effet ne s'annule pas ; programmez-en un nouveau.`,
    );
  }
}

/**
 * **Un seul changement de mode à la fois, par payeur** (§16.6-2) : le mode
 * programmé n'a pas encore pris effet.
 */
export class PayerBillingModeChangePendingError extends BusinessError {
  constructor(
    readonly payerName: string,
    readonly mode: BillingMode,
    readonly effectiveAt: Date,
  ) {
    super(
      "accounting.payer_billing_mode.change_pending",
      `« ${payerName} » passe déjà au mode ${BILLING_MODE_LABELS[mode]} le ` +
        `${parisLongDay(effectiveAt)} à 00h00 (heure de Paris). Un seul changement à la fois : ` +
        `attendez cette date, ou annulez d'abord le changement programmé.`,
    );
  }
}

/** Aucun changement de mode programmé à annuler pour ce payeur. */
export class NoScheduledPayerBillingModeError extends BusinessError {
  constructor(readonly payerName: string) {
    super(
      "accounting.payer_billing_mode.nothing_scheduled",
      `Aucun changement de mode n'est programmé pour « ${payerName} » : il n'y a rien à annuler. ` +
        `Un changement qui a déjà pris effet ne s'annule pas ; programmez-en un nouveau.`,
    );
  }
}

/**
 * **Le mode ne se pose que sur un payeur** (§16.6-5) : ce site est facturé
 * chez un autre, et c'est le mode de cet autre qui fait ses clôtures.
 */
export class NotABillingPayerError extends BusinessError {
  constructor(
    readonly siteName: string,
    readonly payerName: string,
  ) {
    super(
      "accounting.payer_billing_mode.not_a_payer",
      `« ${siteName} » est facturé chez « ${payerName} » : ses commandes suivent le mode de ` +
        `facturation de « ${payerName} ». Réglez le mode sur « ${payerName} », ou détachez d'abord ` +
        `le site pour qu'il règle seul.`,
    );
  }
}

/** Aucun compte client sous cet identifiant. */
export class BillingPayerNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "accounting.payer_billing_mode.company_not_found",
      `Aucun compte client « ${companyId} » : le mode de facturation se règle sur un compte existant.`,
    );
  }
}
