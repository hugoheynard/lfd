import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { AllergenEntry } from "../entities/allergen-entry.js";

/**
 * Port d'**écriture** des entrées du référentiel.
 *
 * Même partage que pour les catégories : l'agrégat entre et sort entier, parce
 * que c'est lui qui porte le verrou `official` et l'archivage. Un
 * `setArchived(id, at)` rendrait le dépôt CRUD et laisserait le verrou au
 * premier handler qui y pense.
 *
 * **Aucune suppression, et ce n'est pas un oubli** : une entrée quitte le
 * référentiel par `archive()`. Un ingrédient peut la citer (FK `Restrict`), les
 * déclarations déjà écrites la citent en clair, et une entrée officielle est du
 * droit — les trois disent la même chose.
 */
export abstract class AllergenEntryRepository {
  abstract findById(id: string): Promise<AllergenEntry | null>;
  /** L'entrée qui porte ce code, s'il y en a une — le code est unique. */
  abstract findByCode(code: string): Promise<AllergenEntry | null>;
  abstract add(entry: AllergenEntry, ticket: WriteTicket): Promise<void>;
  abstract save(entry: AllergenEntry, ticket: WriteTicket): Promise<void>;
}
