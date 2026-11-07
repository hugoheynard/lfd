import { isServableBaseUrl, optionalString } from "./env-readers.js";

/** Le nom de l'adresse publique du bucket des images d'e-mail. */
export const MAIL_PUBLIC_BASE_URL_VARIABLE = "R2_MAIL_PUBLIC_BASE_URL";

/** Le nom de la liste des origines d'où le bloc `mail` accepte de copier une image. */
export const MAIL_IMAGE_ORIGINS_VARIABLE = "MAIL_IMAGE_ORIGINS";

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

/**
 * Les origines d'images admises — `https://media.lafoliecoffee.info,…` —, vide
 * par défaut.
 *
 * C'est elle qui empêche la publication d'un modèle de devenir un client HTTP
 * ouvert : le bloc `mail` ne télécharge que là. Le nom ne dit pas « médiathèque »
 * (§ 23) : le seul contrat est une adresse web.
 *
 * `https` SEULEMENT, sans exception locale : une origine en clair laisserait un
 * intermédiaire substituer l'image qu'on publie. Une entrée illisible ou en
 * clair est ignorée — la liste ne peut que se resserrer, jamais s'ouvrir par
 * une faute de frappe. Chaque entrée est réduite à son origine (schéma, hôte,
 * port) : un chemin écrit par mégarde n'élargit ni ne restreint rien.
 */
export function optionalMailImageOrigins(): readonly string[] {
  const raw = optionalString(MAIL_IMAGE_ORIGINS_VARIABLE);
  if (raw === null) {
    return [];
  }
  const origins = raw
    .split(",")
    .map((entry) => httpsOrigin(entry.trim()))
    .filter((origin): origin is string => origin !== null);
  return [...new Set(origins)];
}

function httpsOrigin(entry: string): string | null {
  if (entry === "") {
    return null;
  }
  try {
    const parsed = new URL(entry);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}
