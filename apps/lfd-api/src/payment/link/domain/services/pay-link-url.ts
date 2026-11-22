/** Le chemin de la page publique, sous la racine de l'origine du lien (§2.3). */
const PAY_PAGE_PATH = "payer";

/**
 * **L'adresse d'un lien** : `<racine de l'origine>/payer/<jeton>`. La racine
 * perd sa barre finale ; le jeton (base64url) n'a rien à échapper.
 */
export function payLinkUrl(publicRoot: string, token: string): string {
  return `${publicRoot.replace(/\/+$/u, "")}/${PAY_PAGE_PATH}/${token}`;
}
