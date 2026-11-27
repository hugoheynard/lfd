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

/**
 * L'**espace pro** hérité : boutique B2B, panier, mes paniers, commandes,
 * entreprises, réglages. Tout le code reste en place et compile ; seules ses
 * ROUTES sont retirées du routeur.
 *
 * Coupé le temps de la démo : l'app cliente refaite doit pouvoir se montrer sans
 * qu'un lien, un signet ou une adresse tapée fasse tomber sur un écran de
 * l'ancienne génération. Repasser à `true` rend l'espace entier, d'un geste.
 *
 * ⚠️ Retirer une route ne protège rien — ce n'est pas une mesure de sécurité,
 * c'est une mesure de NAVIGATION. Ce qui protège les données reste le garde
 * d'authentification et le mur de la société côté API.
 */
export const FEATURE_PRO_SPACE = false;

/**
 * Le **planificateur de commandes** des pros (`/planificateur`, plan
 * `documentation/commandes/planificateur/plan-planificateur-de-commandes.md`,
 * Q7) : sa route et son entrée de menu. Fermé tant que le client demandeur
 * n'a pas été ouvert — un drapeau de PRODUIT pour tous, faute d'un drapeau par
 * société dans la boutique (les niveaux d'accès du serveur sont globaux). Le
 * serveur, lui, sert déjà les routes `/planner` à tout pro.
 */
export const FEATURE_PLANNER = false;
