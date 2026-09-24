/**
 * Ce que les opérations demandent au catalogue : **ces SKU existent-ils ?**
 *
 * Un port à une question, parce que c'est tout ce qu'une sélection a besoin
 * de savoir. Un SKU mal tapé serait sinon écrit sans bruit, puis filtré en
 * silence par le fil vers le commerce — et la bûche manquerait au rayon de
 * Noël sans que personne sache pourquoi.
 */
export abstract class OperationSkuCatalogue {
  /** Ceux de ces SKU qu'aucune déclinaison du référentiel ne porte, dans l'ordre reçu. */
  abstract unknownAmong(skus: readonly string[]): Promise<readonly string[]>;
}
