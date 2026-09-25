import type { PriceFloorView } from "@lfd/contracts";

import type { ReferenceArticle } from "../floor-reference.js";
import type { FloorClientele } from "../../domain/entities/pricing-floor.js";

/**
 * **Port de lecture des limites d'une clientèle**, pour la vue Comptabilité ›
 * Limites de prix (`plan-limites-de-prix.md` §5).
 *
 * Séparé de `PricingDecisionsReader`, qui ne lit que le **pro** et sert trois
 * écrans pro : lui faire rendre aussi le public aurait remis la limite
 * publique dans le `find` de ces écrans. Et séparé du dépôt (ISP) : la vue lit,
 * elle n'écrit rien.
 *
 * **Déclaré dans `application/`**, comme `PricingDecisionsReader` et pour son
 * motif : il se contractualise en `PriceFloorView`, un type du fil.
 */
export abstract class PriceLimitsReader {
  /**
   * Les limites **en vigueur à `at`** de cette clientèle — non archivées, et
   * dans leur fenêtre : une par portée.
   *
   * @param articles Le catalogue de l'appelant ; il sert le tarif de référence
   *   (le signal « à confirmer »), et rien d'autre.
   */
  abstract inForce(
    clientele: FloorClientele,
    at: Date,
    articles: readonly ReferenceArticle[],
  ): Promise<PriceFloorView[]>;
}
