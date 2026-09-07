import type { ProductionDay } from "../entities/production-day.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le port d'écriture de la journée** — il prend et rend l'AGRÉGAT.
 *
 * Pas de `markClosed(date)`, pas de `saveCounts(...)` : une méthode qui écrirait
 * une colonne à partir de primitives ferait sortir l'invariant de l'agrégat pour
 * le poser dans le handler, où le prochain appelant ne le verrait pas. C'est le
 * smell « transaction script » que le `CLAUDE.md` décrit, et la raison pour
 * laquelle ce port n'a que deux méthodes.
 *
 * ⚠️ `load` rend une journée **OUVERTE** quand rien n'est écrit, jamais `null` :
 * une journée qu'on n'a pas encore arrêtée existe — elle est simplement vide. Un
 * `null` obligerait chaque appelant à décider ce qu'il en fait, et l'un d'eux
 * finirait par créer la journée d'une manière que l'agrégat n'a pas prévue.
 */
export abstract class ProductionDayRepository {
  abstract load(day: ServiceDay): Promise<ProductionDay>;

  /**
   * Écrit l'agrégat en entier, commandes et compte compris.
   *
   * L'écriture est **atomique** : un compte à produire enregistré sans ses
   * commandes décrirait une journée que personne ne pourrait relire.
   */
  abstract save(day: ProductionDay): Promise<void>;
}
