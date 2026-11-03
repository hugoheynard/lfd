import type { ProductionDay } from "../entities/production-day.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le port d'écriture de la journée** — il prend et rend l'AGRÉGAT.
 *
 * Pas de `markClosed(date)`, pas de `saveCounts(...)` : une méthode qui écrirait
 * une colonne à partir de primitives ferait sortir l'invariant de l'agrégat pour
 * le poser dans le handler, où le prochain appelant ne le verrait pas. C'est le
 * smell « transaction script » que le `CLAUDE.md` décrit, et la raison pour
 * laquelle ce port n'a que deux méthodes. Les quatre écritures ciblées du
 * colisage (`markPacked`, `markPackedLine`, `recordContainerCount`,
 * `stepContainerCount`) sont parties avec l'ancien poste (K3c).
 *
 * ⚠️ `load` rend une journée **OUVERTE** quand rien n'est écrit, jamais `null` :
 * une journée qu'on n'a pas encore arrêtée existe — elle est simplement vide. Un
 * `null` obligerait chaque appelant à décider ce qu'il en fait, et l'un d'eux
 * finirait par créer la journée d'une manière que l'agrégat n'a pas prévue.
 */
export abstract class ProductionDayRepository {
  abstract load(day: ServiceDay): Promise<ProductionDay>;

  /**
   * Écrit l'agrégat en entier, commandes et compte compris — **jamais les
   * fournées**, qui ont leur port (`ProductionBatchRepository`).
   *
   * L'écriture est **atomique** : un compte à produire enregistré sans ses
   * commandes décrirait une journée que personne ne pourrait relire.
   *
   * 🔴 Elle ne prend QUE le verrou de la LIGNE (`SELECT … FOR UPDATE` sur
   * `production_day`, D4 des fournées) — pas le verrou consultatif de la
   * journée (`ProductionDayLock`), qui seul tient aussi une journée sans
   * ligne. Le verrou de ligne protège l'écriture, il ne rend pas juste un
   * agrégat chargé avant lui : l'appelant qui décide prend `ProductionDayLock`
   * dans son unité de travail, PUIS charge, mute et sauve (vérifié dans
   * `PrismaProductionDayRepository.save` le 2026-11-03).
   *
   * Elle n'écrit plus le colisage (`packed_*`, `container_count`) depuis K3c,
   * mais elle ne l'efface pas non plus : ces colonnes restent en base, et
   * une commande que le geste réécrit les RECOPIE (`carriedPacking`), une
   * commande qu'il ne touche pas les garde — les journées colisées avant la
   * bascule restent lisibles (vérifié le 2026-11-03).
   */
  abstract save(day: ProductionDay): Promise<void>;
}
