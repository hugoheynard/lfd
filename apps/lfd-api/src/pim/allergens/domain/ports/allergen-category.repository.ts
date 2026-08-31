import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { AllergenCategory } from "../entities/allergen-category.js";

/**
 * Port d'**écriture** des catégories d'allergène.
 *
 * Il rend et reprend l'**agrégat**, jamais des colonnes : c'est l'agrégat qui
 * refuse de renommer une catégorie officielle, et une méthode
 * `renameCategory(id, name)` remettrait cet invariant dans le handler — c'est-à-dire hors de vue du
 * prochain handler qui touchera la même table.
 *
 * Séparé de `AllergenCatalogueReader` par ISP : l'écran du référentiel
 * lit tout et n'écrit rien, la commande d'édition écrit un agrégat et ne lit
 * pas le catalogue. Deux besoins, deux interfaces — un consommateur ne dépend
 * que de ce qu'il appelle.
 *
 * **Aucune suppression, et ce n'est pas un oubli** : une catégorie quitte le
 * référentiel par `archive()`, exactement comme une entrée. Une entrée peut la
 * citer (FK `Restrict`), et une catégorie officielle est du droit — les deux
 * disent la même chose. L'état d'archivage part en base par `save()`, puisque
 * c'est l'agrégat entier qui est persisté ; il n'y a donc rien à ajouter ici.
 */
export abstract class AllergenCategoryRepository {
  abstract findById(id: string): Promise<AllergenCategory | null>;
  /** La catégorie qui porte cette clé, s'il y en a une — la clé est unique. */
  abstract findByKey(key: string): Promise<AllergenCategory | null>;
  abstract add(category: AllergenCategory, ticket: WriteTicket): Promise<void>;
  abstract save(category: AllergenCategory, ticket: WriteTicket): Promise<void>;
}
