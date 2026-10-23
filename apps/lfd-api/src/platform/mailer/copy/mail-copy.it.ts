import { ACCOUNT_MAILS_IT } from "./it/account-mails.it.js";
import { BILLING_MAILS_IT } from "./it/billing-mails.it.js";
import { ORDER_MAILS_IT } from "./it/order-mails.it.js";
import { PAYMENT_MAILS_IT } from "./it/payment-mails.it.js";
import { TEAM_MAILS_IT } from "./it/team-mails.it.js";
import type { MailCopy } from "./mail-copy.model.js";

/**
 * L'italien. Traduction de {@link MAIL_FR}, pas une variante : si une phrase
 * française change de sens, celle-ci doit changer avec elle.
 *
 * Rangée par famille d'e-mails (`./it/`), une section par clé du registre.
 */
export const MAIL_IT: MailCopy = {
  ...ORDER_MAILS_IT,
  ...PAYMENT_MAILS_IT,
  ...BILLING_MAILS_IT,
  ...ACCOUNT_MAILS_IT,
  ...TEAM_MAILS_IT,
};
