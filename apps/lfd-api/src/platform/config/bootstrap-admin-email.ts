/**
 * **L'adresse de l'admin racine, telle que la configuration la lit.**
 *
 * Ici et non dans `staff-users/` : c'est une **valeur de configuration** —
 * `BOOTSTRAP_ADMIN_EMAIL`, avec son défaut et sa normalisation. La couche
 * technique doit pouvoir lire sa propre variable d'environnement sans aller
 * chercher un domaine ; l'inverse faisait que `platform` connaissait `staff`,
 * ce que la matrice des frontières interdit — et pour une bonne raison : le jour
 * où le socle staff se pose devant le PIM, il ne doit rien devoir à personne.
 *
 * Ce qui reste dans le domaine, c'est **ce qu'on fait de cette adresse** :
 * la fiche de l'admin racine, son caractère ineffaçable, son rôle. Cf.
 * `staff-users/domain/bootstrap-admin.ts`.
 */

/**
 * E-mail de l'admin racine **par défaut**, quand `BOOTSTRAP_ADMIN_EMAIL` n'est
 * pas posée. Il convient au dev ; en production, pointer une **vraie boîte que
 * quelqu'un relève** — c'est la porte de secours, elle ne sert que si elle est
 * écoutée.
 */
export const DEFAULT_BOOTSTRAP_ADMIN_EMAIL = "dev@lafoliedouce.com";

/** L'adresse racine, normalisée comme toutes les clés e-mail de l'annuaire. */
export function normalizeBootstrapEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? DEFAULT_BOOTSTRAP_ADMIN_EMAIL : trimmed;
}
