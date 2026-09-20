/**
 * L'adresse à laquelle l'app RÉPOND — origine et chemin de déploiement.
 *
 * Écrite quand la build `cloudflare` posait `baseHref: /pro/` : une origine nue
 * aurait renvoyé Auth0 à la racine du domaine, où la passerelle ne routait rien.
 * Depuis le 2026-09-15 l'app est servie à la racine (`baseHref: /`) et la
 * fonction rend l'origine nue — mais elle reste la seule source de l'adresse :
 * le jour où un chemin de déploiement revient, rien d'autre n'est à changer.
 *
 * `document.baseURI` résout le `<base href>` de la page contre l'origine : c'est
 * exactement l'adresse cherchée, dans les deux cas.
 *
 * La barre finale est RETIRÉE, et ce n'est pas de la cosmétique : Auth0 compare
 * ses URL autorisées à l'identique. La retirer laisse les entrées existantes
 * (`https://…pages.dev`, `http://localhost:7316`) valides telles quelles — il n'y
 * a donc qu'une adresse à ajouter, et aucune fenêtre pendant laquelle la
 * connexion serait cassée.
 *
 * @param baseUri le `document.baseURI` de la page ; paramétré pour le test.
 */
export function appBaseUrl(baseUri: string = document.baseURI): string {
  const base = new URL(baseUri);
  return `${base.origin}${base.pathname.replace(/\/$/, '')}`;
}
