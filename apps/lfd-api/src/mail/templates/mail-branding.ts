import type { MailCharterShopFonts } from "@lfd/mail-blocks";

import type { AppConfig } from "../../platform/config/app-config.js";
import type { MailBranding } from "./mail-templates.js";

/**
 * Le woff2 de Chunk, la face de l'enseigne, servi par la boutique sous un nom
 * NON haché : celui du build (`src/styles/fonts/`) prend une empreinte à chaque
 * version, et un e-mail déjà parti pointerait vers un fichier disparu. La copie
 * vit dans `apps/lfc-ecommerce-frontend/public/brand/fonts/` (2026-10-23).
 */
const BRAND_FONT_PATH = "/brand/fonts/chunk-400.woff2";

/**
 * Les woff2 de Pogonia, la police du texte de la boutique — copiés à côté de
 * Chunk le 2026-11-08, sous des noms non hachés : les graisses que les
 * e-mails emploient (400, 600 pour les boutons, 700 pour les totaux).
 */
const SHOP_TEXT_FONT_PATHS = {
  "400": "/brand/fonts/pogonia-400.woff2",
  "600": "/brand/fonts/pogonia-600.woff2",
  "700": "/brand/fonts/pogonia-700.woff2",
} as const;

/** Les secours proposés : proches de la forme, toujours lisibles — c'est eux que Gmail montre. */
const SHOP_HEADING_FALLBACK = "'Arial Black', Impact, sans-serif";
const SHOP_TEXT_FALLBACK = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function shopOrigin(config: AppConfig): string | null {
  const shop = config.clientBaseUrl();
  return shop === null ? null : shop.replace(/\/+$/u, "");
}

/**
 * La marque des gabarits, tirée de la configuration — UNE fois, pour le
 * mailer et pour tout aperçu qui rend un gabarit sans l'envoyer : un aperçu
 * construit avec une autre marque ne montrerait pas l'e-mail qui part.
 *
 * L'adresse de recours est l'admin RACINE, la seule que le domaine protège de
 * toute suppression ou renommage.
 */
export function mailBrandingOf(config: AppConfig): MailBranding {
  const shop = shopOrigin(config);
  return {
    supportEmail: config.bootstrapAdminEmail(),
    backOfficeUrl: config.adminBaseUrl() ?? "",
    ...(shop === null ? {} : { brandFontUrl: `${shop}${BRAND_FONT_PATH}` }),
  };
}

/**
 * Les polices de la boutique, aux adresses stables qu'elle sert — ce que la
 * page « Charte » propose d'un geste ; `null` sans racine de boutique : pas
 * d'adresse inventée.
 */
export function shopFontsOf(config: AppConfig): MailCharterShopFonts | null {
  const shop = shopOrigin(config);
  return shop === null
    ? null
    : {
        // Chunk n'a qu'une graisse : 600 et 700 pointent vers le même fichier,
        // comme la boutique déclare sa plage, pour qu'aucune messagerie ne
        // fabrique un faux gras.
        heading: {
          family: "Chunk",
          url: `${shop}${BRAND_FONT_PATH}`,
          fallback: SHOP_HEADING_FALLBACK,
          weights: { "600": `${shop}${BRAND_FONT_PATH}`, "700": `${shop}${BRAND_FONT_PATH}` },
        },
        text: {
          family: "Pogonia",
          url: `${shop}${SHOP_TEXT_FONT_PATHS["400"]}`,
          fallback: SHOP_TEXT_FALLBACK,
          weights: {
            "600": `${shop}${SHOP_TEXT_FONT_PATHS["600"]}`,
            "700": `${shop}${SHOP_TEXT_FONT_PATHS["700"]}`,
          },
        },
      };
}
