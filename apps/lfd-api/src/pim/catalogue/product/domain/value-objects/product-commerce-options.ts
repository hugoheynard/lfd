import type { Audience } from "../../../shared/domain/value-objects/audience.js";

/** Ce que {@link ProductCommerceOptions.of} reçoit — les trois réglages, sans valeur par défaut. */
export interface ProductCommerceOptionsFields {
  readonly operationOnly: boolean;
  readonly requiresCold: boolean;
  readonly audience: Audience | null;
}

/**
 * **Les réglages de vente d'une fiche** — ce qui change comment elle se vend
 * sans changer ce qu'elle est : réservée aux opérations, au froid, et à qui
 * elle vend.
 *
 * Un value object immuable : chaque `with…` rend un NOUVEL objet, ou `this`
 * quand le réglage y était déjà. L'agrégat s'en sert pour dire « rien à
 * écrire, rien à journaliser » (`StatusChanged`) en comparant les références —
 * le journal est la trace d'audit, et un fait sans changement n'a pas eu lieu.
 *
 * Aucun refus ici : ce que chaque réglage change se juge chez ceux qui vendent
 * ou qui chargent.
 */
export class ProductCommerceOptions {
  private constructor(
    /**
     * **Vendu seulement pendant une opération** — la bûche, pas le croissant. Un
     * fait de la FICHE et non de la ligne d'opération : retirer la bûche de Noël
     * doit la rendre invisible, jamais la vendre toute l'année.
     */
    readonly operationOnly: boolean,
    /**
     * **Demande le froid** — la livraison ne la charge qu'en bac isotherme.
     * `false` n'affirme rien : c'est l'état de toute fiche tant que personne n'a
     * dit qu'elle était froide.
     */
    readonly requiresCold: boolean,
    /** Sa propre audience ; `null` = elle suit sa famille. */
    readonly audience: Audience | null,
  ) {}

  /**
   * Une fiche naît courante, sans froid déclaré, avec l'audience de sa famille.
   * Réserver aux opérations ou déclarer le froid est une
   * décision qu'on prend en le sachant, et qui se lit au journal.
   */
  static initial(): ProductCommerceOptions {
    return new ProductCommerceOptions(false, false, null);
  }

  static of(fields: ProductCommerceOptionsFields): ProductCommerceOptions {
    return new ProductCommerceOptions(fields.operationOnly, fields.requiresCold, fields.audience);
  }

  withOperationOnly(operationOnly: boolean): ProductCommerceOptions {
    return this.operationOnly === operationOnly
      ? this
      : new ProductCommerceOptions(operationOnly, this.requiresCold, this.audience);
  }

  withRequiresCold(requiresCold: boolean): ProductCommerceOptions {
    return this.requiresCold === requiresCold
      ? this
      : new ProductCommerceOptions(this.operationOnly, requiresCold, this.audience);
  }

  withAudience(audience: Audience | null): ProductCommerceOptions {
    return this.audience === audience
      ? this
      : new ProductCommerceOptions(this.operationOnly, this.requiresCold, audience);
  }

  /**
   * Les réglages d'une fiche **née d'un détachement** : l'opération et le
   * froid de la fiche d'origine, l'audience propre de la déclinaison sinon
   * celle que la fiche d'origine pose — son défaut garde le sur mesure de la
   * déclinaison qu'il était, si bien que le détachement n'ouvre à tous les pros
   * aucune recette réservée.
   */
  forDetachedProduct(variantAudience: Audience | null): ProductCommerceOptions {
    return this.withAudience(variantAudience ?? this.audience);
  }
}
