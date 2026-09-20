/**
 * Configuration Auth0 des tests **e2e navigateur** — volontairement vide.
 *
 * Substituée à `auth.env.generated.ts` par la configuration `e2e` d'angular.json.
 * Trois chaînes vides ⇒ `STAFF_AUTH_CONFIGURED` est faux ⇒ l'app ne fournit pas
 * Auth0 du tout et ne montre pas sa porte : c'est l'état déjà prévu d'un poste
 * dont le backend tourne en bypass staff, pas un mode inventé pour les tests.
 *
 * Un **fichier**, plutôt qu'un `.env` vidé le temps du run : régénérer
 * `auth.env.generated.ts` en cours de route déconnecterait le serveur de dev
 * ouvert à côté, sans que personne ne comprenne pourquoi.
 */
export const AUTH_ENV = {
  domain: '',
  clientId: '',
  audience: '',
} as const;
