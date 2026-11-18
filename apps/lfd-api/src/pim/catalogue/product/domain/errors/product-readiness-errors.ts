import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * La fiche a bougé après l'instant de la signature : on ne signe pas ce qu'on
 * n'a pas pu relire.
 *
 * Une déclaration affirme « j'ai vu cette fiche telle qu'elle est ». Si le
 * contenu porte une date de modification postérieure à celle de la signature,
 * la preuve précéderait ce qu'elle prétend couvrir — elle serait périmée avant
 * d'exister.
 */
export class ProductChangedAfterReadinessError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.changed_after_readiness",
      "La fiche a été modifiée après cet instant : la recharger, la relire, puis la déclarer publiable de nouveau.",
    );
  }
}
