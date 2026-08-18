/**
 * Le chemin, côté espace client, où se règle une commande en attente. Écrit ici
 * et nulle part ailleurs : c'est le backend qui fabrique le lien, et il doit
 * tomber sur une route que le front sert réellement.
 */
const SETTLE_PATH = "commandes";

/**
 * Le **lien de règlement** d'une commande, ou `null` si l'espace client n'a pas
 * d'adresse publique configurée.
 *
 * `null` plutôt qu'une URL fabriquée : `CLIENT_BASE_URL` est optionnelle, et
 * inventer une racine enverrait le client sur une page qui n'existe pas. L'appel
 * annonce alors qu'il n'y a pas de lien — la commande, elle, est passée, et le
 * client peut toujours la régler depuis son espace.
 */
export function paymentUrlFor(clientBaseUrl: string | null, orderId: string): string | null {
  if (clientBaseUrl === null || clientBaseUrl.trim() === "") {
    return null;
  }
  const root = clientBaseUrl.replace(/\/+$/u, "");
  return `${root}/${SETTLE_PATH}/${encodeURIComponent(orderId)}/regler`;
}
