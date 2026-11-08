import { isServableBaseUrl, optionalString } from "./env-readers.js";

/** Le nom de l'adresse publique du bucket des images d'e-mail. */
export const MAIL_PUBLIC_BASE_URL_VARIABLE = "R2_MAIL_PUBLIC_BASE_URL";

/**
 * L'adresse **publique** du bucket des images d'e-mail, sans barre finale, ou
 * `null` (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`, § 24).
 *
 * Même règle que l'adresse des médias : `https`, ou le clair en boucle locale
 * (MinIO de dev). Une valeur non servable compte comme absente : la copie
 * refuse en la nommant, plutôt que de ranger des images sous une adresse que
 * les messageries ne sauraient pas lire.
 */
export function optionalMailPublicBaseUrl(): string | null {
  const raw = optionalString(MAIL_PUBLIC_BASE_URL_VARIABLE);
  if (raw === null) {
    return null;
  }
  const trimmed = raw.replace(/\/+$/, "");
  return isServableBaseUrl(trimmed) ? trimmed : null;
}
