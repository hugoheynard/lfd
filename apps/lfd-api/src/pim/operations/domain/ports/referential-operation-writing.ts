/**
 * **Les opérations s'écrivent-elles encore au référentiel ?**
 *
 * Oui jusqu'à la bascule ; non dès que `OPERATIONS_AT_COMMERCE` est ouvert
 * (lot 3 de `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`) :
 * l'opération vit alors au commerce, et une écriture ici ne serait plus lue
 * par personne — ni poussée, ni migrée deux fois.
 *
 * Un port plutôt que la configuration lue dans chaque cas d'usage : les six
 * gestes posent la même question, et un double y répond sans monter la
 * configuration.
 */
export abstract class ReferentialOperationWriting {
  abstract isOpen(): boolean;
}
