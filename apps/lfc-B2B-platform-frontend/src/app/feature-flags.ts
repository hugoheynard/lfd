/**
 * Drapeaux de **fonctionnalité produit** — activent ou masquent des pans de
 * l'app depuis un point unique. À distinguer des `auth/dev-flags` (bypass
 * d'environnement, sécurité) : ceux-ci relèvent du produit.
 */

/**
 * Le **tableau de bord** d'accueil. Masqué tant que ses indicateurs ne sont pas
 * prêts : l'item de menu disparaît et `/` redirige vers Boutique. Repasser à
 * `true` le réactive intégralement (menu + route).
 */
export const FEATURE_DASHBOARD = false;
