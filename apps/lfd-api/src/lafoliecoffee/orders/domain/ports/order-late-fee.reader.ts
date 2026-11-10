import type { CartAdjustment } from "@lfd/contracts";

/** Le réglage de la surtaxe : combien, et à quel taux. */
export interface LateFeeSetting {
  readonly adjustment: CartAdjustment;
  /** Le taux appliqué, en %. Choisi parmi ceux du référentiel, jamais deviné. */
  readonly vatRatePercent: number;
}

/**
 * Port de **lecture** de la surtaxe de commande tardive, vu depuis la
 * passation.
 *
 * Composer une commande n'autorise pas à changer le montant : le réglage se pose
 * ailleurs, par quelqu'un d'autre. Ce port ne sait donc que lire.
 *
 * `null` = **aucune surtaxe réglée**, et c'est un état valable : la maison peut
 * vouloir rattraper sans facturer. Une valeur par défaut aurait facturé un
 * montant que personne n'a décidé.
 */
export abstract class OrderLateFeeReader {
  abstract current(): Promise<LateFeeSetting | null>;
}
