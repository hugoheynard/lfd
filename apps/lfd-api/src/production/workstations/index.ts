/**
 * La porte des postes (`workstations/`) : ce que les autres métiers du fournil
 * lisent des postes (`documentation/fournil/les-postes-du-fournil.md`, § 3.1). Tout le
 * reste de `workstations/` est privé (on y entre par cet index, qui ne fait
 * que réexporter : `documentation/fournil/architecture-contexte-production.md`,
 * « Les règles de la surface » ; porte `lint:production-subcontexts`).
 *
 * Le rangement lui-même n'est pas ici : c'est une fonction pure de
 * l'imprimerie, qui reçoit les postes en paramètre. Sa lecture, elle, l'est.
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
/**
 * Le rangement de SKU selon le mode — rayons, ou articles puis postes avec
 * repli par rayon —, et ce que ses lectures ont pu dire (la fiche, le dossier).
 */
export { GroupingSourceReading } from "./application/services/grouping-source-reading.service.js";
/** Combien de produits ont un poste (la garde de bascule en mode prod). */
export { PlacedProducts } from "./domain/ports/placed-products.js";
/** Le numéro de la carte, qui change à chaque geste (l'étiquette de la fiche gardée). */
export { WorkstationMapVersion } from "./domain/ports/workstation-map-version.js";
