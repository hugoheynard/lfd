import type { AppConfig } from "../config/app-config.js";
import type { MailBranding } from "./mail-templates.js";

/**
 * Le woff2 de Chunk, la face de l'enseigne, servi par la boutique sous un nom
 * NON haché : celui du build (`src/styles/fonts/`) prend une empreinte à chaque
 * version, et un e-mail déjà parti pointerait vers un fichier disparu. La copie
 * vit dans `apps/lfc-ecommerce-frontend/public/brand/fonts/` (2026-10-23).
 */
const BRAND_FONT_PATH = "/brand/fonts/chunk-400.woff2";

/**
 * La marque des gabarits, tirée de la configuration — UNE fois, pour le
 * mailer et pour tout aperçu qui rend un gabarit sans l'envoyer : un aperçu
 * construit avec une autre marque ne montrerait pas l'e-mail qui part.
 *
 * L'adresse de recours est l'admin RACINE, la seule que le domaine protège de
 * toute suppression ou renommage.
 */
export function mailBrandingOf(config: AppConfig): MailBranding {
  const shop = config.clientBaseUrl();
  return {
    supportEmail: config.bootstrapAdminEmail(),
    backOfficeUrl: config.adminBaseUrl() ?? "",
    ...(shop === null ? {} : { brandFontUrl: `${shop.replace(/\/+$/u, "")}${BRAND_FONT_PATH}` }),
  };
}
