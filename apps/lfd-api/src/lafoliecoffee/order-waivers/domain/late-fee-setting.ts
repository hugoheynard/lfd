import type { CartAdjustment } from "@lfd/contracts";

/**
 * **Le réglage de la surtaxe de commande tardive** : combien, et à quel taux.
 * Ce que coûte une dérogation, posé par l'administration et lu par le verdict
 * du délai de commande.
 */
export interface LateFeeSetting {
  readonly adjustment: CartAdjustment;
  /** Le taux appliqué, en %. Choisi parmi ceux du référentiel, jamais deviné. */
  readonly vatRatePercent: number;
}
