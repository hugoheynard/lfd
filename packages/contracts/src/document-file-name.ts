/** La marque en tête de chaque nom de fichier : on reconnaît d'où vient le document. */
const BRAND = "LFC";

/** Assez pour une enseigne, pas assez pour qu'un nom de fichier déborde d'un explorateur. */
const MAX_CUSTOMER_LENGTH = 40;

/**
 * **Le nom d'un client, sûr pour un nom de fichier** : majuscules, accents
 * retirés, tout ce qui n'est pas `[A-Z0-9]` devient « - », sans tiret doublé
 * ni en bordure, borné à {@link MAX_CUSTOMER_LENGTH} caractères. Vide si rien
 * de lisible ne reste.
 */
export function fileNameCustomerPart(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CUSTOMER_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * **Le nom proposé au téléchargement d'un document de commande** —
 * `LFC-<référence>-<client>-<suffixe>.pdf`, pour qu'il se reconnaisse dans un
 * dossier de téléchargements. Le client manque si son nom ne laisse rien de
 * lisible. Ce n'est jamais une clé de stockage.
 */
export function orderDocumentFileName(
  reference: string,
  customerName: string,
  suffix: string,
): string {
  const parts = [BRAND, reference, fileNameCustomerPart(customerName), suffix];
  return `${parts.filter((part) => part !== "").join("-")}.pdf`;
}
