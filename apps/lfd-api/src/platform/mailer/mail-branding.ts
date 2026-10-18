import type { AppConfig } from "../config/app-config.js";
import type { MailBranding } from "./mail-templates.js";

/**
 * La marque des gabarits, tirée de la configuration — UNE fois, pour le
 * mailer et pour tout aperçu qui rend un gabarit sans l'envoyer : un aperçu
 * construit avec une autre marque ne montrerait pas l'e-mail qui part.
 *
 * L'adresse de recours est l'admin RACINE, la seule que le domaine protège de
 * toute suppression ou renommage.
 */
export function mailBrandingOf(config: AppConfig): MailBranding {
  return {
    supportEmail: config.bootstrapAdminEmail(),
    backOfficeUrl: config.adminBaseUrl() ?? "",
  };
}
