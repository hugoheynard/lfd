/**
 * **Les opérations s'écrivent-elles encore au référentiel ?**
 *
 * Non, depuis la bascule (lot 3 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`) :
 * l'opération vit au commerce, et une écriture ici ne serait plus lue par
 * personne — ni poussée, ni migrée deux fois. En production, la réponse est
 * fixe (`ClosedReferentialOperationWriting`, 2026-10-17) ; le port reste pour
 * que les tests préparent encore ce que la migration reprend.
 *
 * Un port plutôt que la configuration lue dans chaque cas d'usage : les six
 * gestes posent la même question, et un double y répond sans monter la
 * configuration.
 */
export abstract class ReferentialOperationWriting {
  abstract isOpen(): boolean;
}
