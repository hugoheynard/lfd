/**
 * Ce que les opérations demandent au catalogue du commerce : **ces SKU
 * existent-ils ?** (O2 du plan : la sélection se choisit parmi les SKU que le
 * commerce connaît.)
 *
 * Un port à une question, parce que c'est tout ce qu'une sélection a besoin de
 * savoir. Un SKU mal tapé serait sinon écrit sans bruit, et la bûche
 * manquerait au rayon de Noël sans que personne sache pourquoi.
 */
export abstract class OperationSkuCatalogue {
  /** Ceux de ces SKU que le commerce ne connaît pas, dans l'ordre reçu. */
  abstract unknownAmong(skus: readonly string[]): Promise<readonly string[]>;
}
