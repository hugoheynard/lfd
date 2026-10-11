import type { OperationImageFacts } from "../entities/catalog-operation.js";

/**
 * **Projette l'image d'une opération reçue, seulement si elle est plus
 * récente** que celle déjà posée (`documentation/mediatheque/mediatheque.md`
 * §7 bis, 2026-10-11).
 *
 * Port à part de `CatalogOperationRepository`, pour la raison de
 * `CatalogVisualsProjection` : la règle qui peut refuser l'écriture — « un
 * geste plus ancien que le dernier appliqué n'écrit rien » — ne s'écrit
 * qu'en base. Charger l'agrégat, comparer puis enregistrer laisserait deux
 * livraisons concurrentes se doubler ; l'adaptateur fait UNE écriture
 * conditionnée (`image_gesture_id IS NULL OR < geste`) qui pose le geste dans
 * le même mouvement.
 *
 * Elle ne touche que l'image — ni dates, ni sélection, ni clientèle, qui ne
 * traversent qu'au push. Une opération inconnue du commerce n'écrit rien :
 * une opération naît d'un envoi.
 *
 * L'ordre est celui des chaînes : les gestes sont des UUID v7 du référentiel,
 * préfixés par l'horodatage.
 */
export abstract class CatalogOperationImageProjection {
  abstract showIfNewer(
    operationKey: string,
    gestureId: string,
    image: OperationImageFacts | null,
  ): Promise<void>;
}
