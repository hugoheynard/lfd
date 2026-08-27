/**
 * L'adresse à laquelle l'app RÉPOND — origine et chemin de déploiement.
 *
 * `window.location.origin` a suffi tant que l'app vivait à la racine. Elle n'y
 * vit plus partout : la build `cloudflare` pose `baseHref: /pro/`, et une origine
 * nue renverrait Auth0 à la racine du domaine, où la passerelle ne route rien —
 * le `?code` du callback tomberait à côté. Invisible en développement, et
 * systématique en production.
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
