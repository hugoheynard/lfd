import type { Operation } from "../entities/operation.js";

/**
 * **Écrire une opération reprise du référentiel** (lot 3) — le port
 * d'écriture de la migration. Il prend l'agrégat, comme `OperationRepository`.
 *
 * Distinct du dépôt (ISP) parce que son geste l'est : il CRÉE ou RÉÉCRIT,
 * selon que le miroir portait déjà la clé, et il pose `received_at` à
 * l'instant de la migration — la colonne garde son sens de « dernière
 * arrivée » (plan, `received_at`). Aucun geste du staff n'y touche.
 */
export abstract class OperationAdoption {
  /** Dans la transaction ambiante ; l'instant est celui de la signature de l'agrégat. */
  abstract adopt(operation: Operation): Promise<void>;
}
