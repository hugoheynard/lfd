/**
 * **Le moyen par lequel un compte se connecte**, tel qu'on peut le nommer à la
 * personne : « reprenez ce chemin ».
 *
 * Né le 2026-10-09 avec la connexion par code e-mail : le refus d'un second
 * compte disait « Google » en dur, alors qu'il pouvait désormais s'agir d'un
 * compte ouvert par mot de passe ou par code. Un refus qui nomme le mauvais
 * chemin renvoie la personne vers une porte qui ne l'ouvrira pas.
 *
 * Il se DÉDUIT du fournisseur (le préfixe du `sub`, ou le `provider` d'une
 * identité chez Auth0) et ne sert qu'à PARLER : aucun accès n'en dépend. Un
 * fournisseur inconnu donne `other`, jamais une supposition.
 */
export type SignInRoute = "password" | "email_code" | "google" | "facebook" | "other";

/**
 * Les fournisseurs Auth0 connus, et leur chemin. `auth0` est la connexion base
 * de données (mot de passe), `email` la connexion sans mot de passe par code.
 */
const ROUTE_BY_PROVIDER: ReadonlyMap<string, SignInRoute> = new Map<string, SignInRoute>([
  ["auth0", "password"],
  ["email", "email_code"],
  ["google-oauth2", "google"],
  ["facebook", "facebook"],
]);

/** Le chemin d'un fournisseur Auth0 (`auth0`, `email`, `google-oauth2`…). */
export function signInRouteOfProvider(provider: string): SignInRoute {
  return ROUTE_BY_PROVIDER.get(provider) ?? "other";
}

/**
 * Le chemin d'un sujet Auth0 (`email|…`, `auth0|…`) — le fournisseur est ce
 * qui précède la première barre. Un sujet sans barre n'a pas de fournisseur
 * lisible : `other`.
 */
export function signInRouteOfSubject(subject: string): SignInRoute {
  const bar = subject.indexOf("|");
  return bar <= 0 ? "other" : signInRouteOfProvider(subject.slice(0, bar));
}
