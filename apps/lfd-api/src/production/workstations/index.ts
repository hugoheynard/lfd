/**
 * La porte des postes (`workstations/`) : ce que les autres métiers du fournil
 * lisent des postes (plan `fournil/plan-postes-du-fournil.md`, § 3.1). Tout le
 * reste de `workstations/` est privé (on y entre par cet index, qui ne fait
 * que réexporter : `documentation/fournil/architecture-contexte-production.md`,
 * « Les règles de la surface » ; porte `lint:production-subcontexts`).
 *
 * Le rangement n'est pas ici : c'est une fonction pure de l'imprimerie, qui
 * reçoit les postes en paramètre.
 *
 * Ce fichier ne fait que réexporter, et rien de ce qu'il réexporte ne charge
 * un autre métier : un cycle d'imports à travers un `index.ts` rend une
 * classe `undefined` quand Nest lit ses métadonnées.
 */

/**
 * ## Ce que les postes savent répondre
 *
 * Un port étroit par question, implémenté sur les tables des postes.
 */
/** Le poste de chaque produit, et la liste ordonnée des postes en service (la fiche, le dossier). */
export { WorkstationOfProducts } from "./domain/ports/workstation-of-products.js";
/** Combien de produits ont un poste (la garde de bascule en mode prod). */
export { PlacedProducts } from "./domain/ports/placed-products.js";
