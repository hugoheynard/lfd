import { ACCOUNT_MAILS_EN } from "./en/account-mails.en.js";
import { BILLING_MAILS_EN } from "./en/billing-mails.en.js";
import { ORDER_CHANGE_MAILS_EN } from "./en/order-change-mails.en.js";
import { ORDER_MAILS_EN } from "./en/order-mails.en.js";
import { ORDER_SHORTFALL_MAILS_EN } from "./en/order-shortfall-mails.en.js";
import { PAYMENT_MAILS_EN } from "./en/payment-mails.en.js";
import { TEAM_MAILS_EN } from "./en/team-mails.en.js";
import type { MailCopy } from "./mail-copy.model.js";

/**
 * L'anglais. Traduction de {@link MAIL_FR}, pas une variante : si une phrase
 * française change de sens, celle-ci doit changer avec elle.
 *
 * Rangée par famille d'e-mails (`./en/`), une section par clé du registre.
 */
export const MAIL_EN: MailCopy = {
  ...ORDER_MAILS_EN,
  ...PAYMENT_MAILS_EN,
  ...BILLING_MAILS_EN,
  ...ACCOUNT_MAILS_EN,
  ...TEAM_MAILS_EN,
  ...ORDER_CHANGE_MAILS_EN,
  ...ORDER_SHORTFALL_MAILS_EN,
};
