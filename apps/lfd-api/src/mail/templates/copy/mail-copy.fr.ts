import { ACCOUNT_MAILS_FR } from "./fr/account-mails.fr.js";
import { BILLING_MAILS_FR } from "./fr/billing-mails.fr.js";
import { ORDER_CHANGE_MAILS_FR } from "./fr/order-change-mails.fr.js";
import { ORDER_MAILS_FR } from "./fr/order-mails.fr.js";
import { ORDER_SHORTFALL_MAILS_FR } from "./fr/order-shortfall-mails.fr.js";
import { PAYMENT_MAILS_FR } from "./fr/payment-mails.fr.js";
import { TEAM_MAILS_FR } from "./fr/team-mails.fr.js";
import type { MailCopy } from "./mail-copy.model.js";

/**
 * La langue de référence — celle que la maquette écrit, et celle dont les deux
 * autres sont la traduction.
 *
 * Rangée par famille d'e-mails (`./fr/`), une section par clé du registre.
 */
export const MAIL_FR: MailCopy = {
  ...ORDER_MAILS_FR,
  ...PAYMENT_MAILS_FR,
  ...BILLING_MAILS_FR,
  ...ACCOUNT_MAILS_FR,
  ...TEAM_MAILS_FR,
  ...ORDER_CHANGE_MAILS_FR,
  ...ORDER_SHORTFALL_MAILS_FR,
};
