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

  /**
   * Grave le **colisage** d'une commande. Écriture nue, et conditionnée en base.
   *
   * ⚠️ **Ce n'est pas une entorse au §3.1, c'est le cas qu'il autorise.** Une
   * `load` → `pack()` → `save` réécrirait la journée entière, donc deux postes
   * qui scannent la même feuille au même moment se perdraient l'un l'autre — et
   * deux mains sur la même commande est le cas NORMAL au fournil, pas une
   * anomalie. La condition `packed_at IS NULL` fait arbitrer la BASE.
   *
   * La règle métier, elle, reste dans l'agrégat : `pack()` refuse une journée
   * ouverte, une référence inconnue, un bac déjà fait. Elle est évaluée sur
   * l'état lu ; cette écriture ne tranche que la course. C'est exactement le
   * partage de `markHandedOver` côté commerce.
   *
   * Rend `false` quand la course est perdue.
   */
  abstract markPacked(day: ServiceDay, reference: string, at: Date, by: string): Promise<boolean>;
}
