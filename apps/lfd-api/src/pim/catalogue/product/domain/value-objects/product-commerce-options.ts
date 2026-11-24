import type { Audience } from "../../../shared/domain/value-objects/audience.js";

/** Ce que {@link ProductCommerceOptions.of} reçoit — les quatre réglages, sans valeur par défaut. */
export interface ProductCommerceOptionsFields {
  readonly operationOnly: boolean;
  readonly requiresCold: boolean;
  readonly audience: Audience | null;
  readonly variantsAsTiles: boolean;
}

/**
 * **Les réglages de vente d'une fiche** — ce qui change comment elle se vend
 * sans changer ce qu'elle est : réservée aux opérations, au froid, à qui elle
 * vend, et si chaque déclinaison paraît en vignette.
 *
 * Un value object immuable : chaque `with…` rend un NOUVEL objet, ou `this`
 * quand le réglage y était déjà. L'agrégat s'en sert pour dire « rien à
 * écrire, rien à journaliser » (`StatusChanged`) en comparant les références —
 * le journal est la trace d'audit, et un fait sans changement n'a pas eu lieu.
 *
 * Aucun refus ici : ce que chaque réglage change se juge chez ceux qui vendent
 * ou qui chargent. Le seul refus qui touche ces réglages (décocher les
 * vignettes quand le défaut est sur mesure, V5) dépend des déclinaisons : il
 * est à l'agrégat, qui voit les deux.
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
    /** Montrer chaque déclinaison en vignette au rayon, ou seulement le défaut. */
    readonly variantsAsTiles: boolean,
  ) {}

  /**
   * Une fiche naît courante, sans froid déclaré, avec l'audience de sa famille,
   * et en montrant chaque déclinaison (le comportement de base, qu'on décoche
   * fiche par fiche). Réserver aux opérations ou déclarer le froid est une
   * décision qu'on prend en le sachant, et qui se lit au journal.
   */
  static initial(): ProductCommerceOptions {
    return new ProductCommerceOptions(false, false, null, true);
  }

  static of(fields: ProductCommerceOptionsFields): ProductCommerceOptions {
    return new ProductCommerceOptions(
      fields.operationOnly,
      fields.requiresCold,
      fields.audience,
      fields.variantsAsTiles,
    );
  }

  withOperationOnly(operationOnly: boolean): ProductCommerceOptions {
    return this.operationOnly === operationOnly
      ? this
      : new ProductCommerceOptions(
          operationOnly,
          this.requiresCold,
          this.audience,
          this.variantsAsTiles,
        );
  }

  withRequiresCold(requiresCold: boolean): ProductCommerceOptions {
    return this.requiresCold === requiresCold
      ? this
      : new ProductCommerceOptions(
          this.operationOnly,
          requiresCold,
          this.audience,
          this.variantsAsTiles,
        );
  }

  withAudience(audience: Audience | null): ProductCommerceOptions {
    return this.audience === audience
      ? this
      : new ProductCommerceOptions(
          this.operationOnly,
          this.requiresCold,
          audience,
          this.variantsAsTiles,
        );
  }

  withVariantsAsTiles(variantsAsTiles: boolean): ProductCommerceOptions {
    return this.variantsAsTiles === variantsAsTiles
      ? this
      : new ProductCommerceOptions(
          this.operationOnly,
          this.requiresCold,
          this.audience,
          variantsAsTiles,
        );
  }

  /**
   * Les réglages d'une fiche **née d'un détachement** : l'opération et le
   * froid de la fiche d'origine, l'audience propre de la déclinaison sinon
   * celle que la fiche d'origine pose, et les vignettes montrées — son défaut
   * garde le sur mesure de la déclinaison qu'il était, si bien que le
   * détachement n'ouvre à tous les pros aucune recette réservée.
   */
  forDetachedProduct(variantAudience: Audience | null): ProductCommerceOptions {
    return this.withVariantsAsTiles(true).withAudience(variantAudience ?? this.audience);
  }
}
