import type { PimImage } from "../entities/catalog-item.js";

/**
 * **Projette les visuels d'un produit, seulement s'ils sont plus récents** que
 * ceux déjà posés.
 *
 * Port à part de `CatalogItemRepository`, qui refuse toute écriture à partir
 * de primitives : ici, la règle qui peut refuser l'écriture — « un geste plus
 * ancien que le dernier appliqué n'écrit rien » — **ne peut s'écrire qu'en
 * base**. Les visuels sont figés dans le fait durable ; un fait ancien rejoué
 * APRÈS un plus récent (le premier en échec, le second livré) remettait
 * l'ancienne image (`documentation/journalisation/plan-evenements-durables.md`
 * §7 quater, #12, 2026-10-10). Charger, comparer puis enregistrer laisserait
 * deux livraisons concurrentes se doubler : l'adaptateur fait UNE écriture
 * conditionnée par produit (`visuals_gesture_id IS NULL OR < geste`), qui pose
 * le geste dans le même mouvement.
 *
 * Elle ne touche que les visuels — ni le prix, ni le retrait, ni la décision
 * commerciale — et vise toutes les déclinaisons, retirées comprises : recevoir
 * une photo n'est pas revenir au catalogue. Un produit inconnu du commerce
 * n'écrit rien, et rien n'est créé : un article naît d'un push.
 *
 * L'ordre est celui des chaînes : les gestes sont des UUID v7 du référentiel,
 * préfixés par l'horodatage.
 */
export abstract class CatalogVisualsProjection {
  abstract showIfNewer(
    productId: string,
    gestureId: string,
    image: PimImage | null,
    thumbnail: PimImage | null,
  ): Promise<void>;
}
