import {
  InvalidProductVariantsError,
  VariantNotFoundError,
  VariantNotInProductError,
} from "../errors/product-errors.js";
import {
  DefaultVariantNotDetachableError,
  DefaultVariantNotDiscontinuableError,
  DiscontinuedVariantNotDefaultableError,
  LastLiveVariantNotDiscontinuableError,
  VariantAlreadyDefaultError,
  VariantAlreadyDiscontinuedError,
} from "../errors/variant-lifecycle-errors.js";
import { PricingAlignmentAcrossUnitsError } from "../errors/sale-unit-errors.js";
import { CustomRecipeDefaultWithoutTilesError } from "../errors/custom-recipe-errors.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { DefaultVariantChange } from "./product-state.js";
import { resolveVariant } from "./variant-resolution.js";
import { refuseOwnAudienceDefault } from "./variant-audience.js";
import { Variant, type VariantAspect, type VariantSnapshot } from "./variant.js";

/** Ce qu'il faut pour ouvrir une déclinaison de plus. */
export interface NewVariantInput {
  readonly id: string;
  readonly sku: Sku;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
}

/**
 * **Les déclinaisons d'une fiche** — la collection que `Product` possède, et
 * les règles qui ne se jugent qu'en les voyant toutes : exactement une par
 * défaut, la dernière vivante ne s'arrête pas, une alignée se vend dans l'unité
 * du défaut qu'elle suit.
 *
 * Elle porte l'identifiant de la fiche parce que chaque refus d'appartenance
 * doit le nommer : c'est elle qui dit ce qui est DANS la fiche, et une requête
 * forgée sur le seul identifiant d'une déclinaison n'a donc aucun effet sur
 * celle d'une autre fiche. Elle ne connaît ni le statut, ni les réglages de
 * vente : ce qu'elle en a besoin (« la fiche est-elle en ligne », « montre-t-elle
 * ses vignettes ») lui est passé.
 */
export class VariantLineup {
  private constructor(
    private readonly productId: string,
    private readonly variants: Variant[],
  ) {}

  /** Ouvrir une fiche, c'est ouvrir sa déclinaison par défaut avec elle : jamais de fenêtre où l'invariant 2 est faux. */
  static open(
    productId: string,
    defaultVariant: { id: string; sku: Sku; name: LocalizedText },
  ): VariantLineup {
    return new VariantLineup(productId, [Variant.openDefault(defaultVariant)]);
  }

  /** Le défaut d'une fiche née d'un détachement : la déclinaison qu'elle était, devenue la seule. */
  static fromDetached(productId: string, defaultVariant: Variant): VariantLineup {
    return new VariantLineup(productId, [defaultVariant]);
  }

  /**
   * Relit les déclinaisons — et refuse une ligne incohérente (**invariant 2** :
   * au moins une, et exactement une par défaut) au chargement plutôt que de la
   * laisser ressortir vers les canaux.
   */
  static reconstitute(productId: string, snapshots: readonly VariantSnapshot[]): VariantLineup {
    if (snapshots.length === 0) {
      throw new InvalidProductVariantsError(productId, "aucune déclinaison");
    }
    const defaults = snapshots.filter((variant) => variant.isDefault).length;
    if (defaults !== 1) {
      throw new InvalidProductVariantsError(
        productId,
        `${String(defaults)} déclinaison(s) par défaut au lieu d’une`,
      );
    }
    return new VariantLineup(
      productId,
      snapshots.map((variant) => Variant.reconstitute(variant)),
    );
  }

  /** Les déclinaisons, archivées comprises : leur rang reste pris. */
  all(): readonly Variant[] {
    return this.variants;
  }

  /** @throws {VariantNotFoundError} la déclinaison n'est pas de cette fiche. */
  get(variantId: string): Variant {
    const found = this.variants.find((candidate) => candidate.id === variantId);
    if (found === undefined) {
      throw new VariantNotFoundError(this.productId, variantId);
    }
    return found;
  }

  /**
   * **La déclinaison par défaut** — l'invariant 2 garantit qu'il y en a une.
   * Le repli sur la première n'est pas une prudence de plus : `find` rend
   * `T | undefined` quel que soit l'invariant, et le compilateur ne lit pas
   * les garanties écrites en prose.
   */
  get defaultVariant(): Variant {
    return this.variants.find((variant) => variant.isDefault) ?? this.variants[0]!;
  }

  /**
   * Le rang de la prochaine déclinaison — jamais leur nombre : la RÉFÉRENCE en
   * dérive (`P-XXXXXX-3`) et se fabrique avant l'ajout, contre le registre. Les
   * compter rouvrirait la porte à deux `-2` le jour où une déclinaison est
   * retirée du milieu.
   */
  get nextPosition(): number {
    return this.variants.reduce((highest, variant) => Math.max(highest, variant.position), -1) + 1;
  }

  /** Une déclinaison vue **résolue** : une alignée porte ce que le défaut lui prête. */
  resolved(variant: Variant): VariantSnapshot {
    return resolveVariant(variant, this.defaultVariant);
  }

  resolvedSnapshots(): VariantSnapshot[] {
    return this.variants.map((variant) => this.resolved(variant));
  }

  /** Ce que chaque déclinaison PORTE, héritage non résolu — celui qu'on persiste. */
  ownSnapshots(): VariantSnapshot[] {
    return this.variants.map((variant) => variant.snapshot());
  }

  /**
   * Ajoute une déclinaison — **jamais la première**, jamais celle par défaut.
   * Elle prend le rang suivant, hérite du sur mesure du défaut (sur une fiche
   * réservée, elle naît fermée comme ses sœurs plutôt qu'ouverte à tous), et sa
   * fiche réglementaire suit celle du défaut. Sur une fiche en vente, elle
   * part au prochain envoi : déjà publiée.
   */
  add(input: NewVariantInput, productPublished: boolean): Variant {
    const variant = Variant.open({
      ...input,
      position: this.nextPosition,
      customRecipe: this.defaultVariant.customRecipe,
    });
    if (productPublished) {
      variant.markPublished();
    }
    this.variants.push(variant);
    return variant;
  }

  /** La fiche part en vente, et toutes les déclinaisons avec elle : c'est ce qui fige leur unité. */
  markAllPublished(): void {
    for (const variant of this.variants) {
      variant.markPublished();
    }
  }

  /**
   * Archive une déclinaison. Elle RESTE dans la collection : son rang reste
   * pris, et la suivante prend `-3` après un `-2` archivé, jamais `-2-2`.
   *
   * @throws {DefaultVariantNotDiscontinuableError} le défaut, tant qu'il en reste d'autres.
   * @throws {LastLiveVariantNotDiscontinuableError} la dernière vivante : c'est la fiche qu'on archive.
   * @throws {VariantAlreadyDiscontinuedError} déjà archivée.
   */
  discontinue(variantId: string): void {
    const target = this.get(variantId);
    if (target.isDiscontinued) {
      throw new VariantAlreadyDiscontinuedError(target.sku);
    }
    const othersAlive = this.variants.some(
      (variant) => variant.id !== variantId && !variant.isDiscontinued,
    );
    if (!othersAlive) {
      throw new LastLiveVariantNotDiscontinuableError(target.sku);
    }
    if (target.isDefault) {
      throw new DefaultVariantNotDiscontinuableError(target.sku);
    }
    target.discontinue();
  }

  /**
   * Sort une déclinaison pour en faire un produit : elle s'archive en se disant
   * devenue `newProductId`, et rend l'instantané RÉSOLU dont le produit naît.
   *
   * @throws {DefaultVariantNotDetachableError} le défaut porte la fiche.
   * @throws {VariantAlreadyDiscontinuedError} une archivée ne se détache pas.
   */
  detach(variantId: string, newProductId: string): VariantSnapshot {
    const target = this.get(variantId);
    if (target.isDiscontinued) {
      throw new VariantAlreadyDiscontinuedError(target.sku);
    }
    if (target.isDefault) {
      throw new DefaultVariantNotDetachableError(target.sku);
    }
    const resolved = this.resolved(target);
    target.detachTo(newProductId);
    return resolved;
  }

  /** Désarchive — celle devenue un produit reste refusée, par la déclinaison. */
  restore(variantId: string, detachedProductLabel?: string): void {
    this.get(variantId).restore(detachedProductLabel);
  }

  /**
   * Fait d'une déclinaison la déclinaison par défaut. Ce qui SUIT le défaut
   * suit désormais la nouvelle (le lien est vivant, rien à écrire chez les
   * sœurs) ; la nouvelle reçoit en PROPRE ce qu'elle voyait, drapeaux remis à
   * `false` ; l'ancienne garde ses valeurs. Tenu après la bascule : une sœur
   * qui suit le tarif se vend dans l'unité du nouveau défaut.
   *
   * @returns l'ancien défaut, et les moitiés de fiche que la nouvelle a reçues
   *   en propre — elles se persistent par leurs ports dédiés.
   * @throws {VariantAlreadyDefaultError} elle l'est déjà.
   * @throws {DiscontinuedVariantNotDefaultableError} elle est archivée.
   * @throws {CustomRecipeDefaultWithoutTilesError} sur mesure sur une fiche sans vignettes.
   * @throws {OwnAudienceVariantNotDefaultableError} elle a sa propre audience (A2).
   * @throws {PricingAlignmentAcrossUnitsError} une sœur suivrait un tarif d'une autre unité.
   */
  makeDefault(variantId: string, variantsAsTiles: boolean): DefaultVariantChange {
    const target = this.get(variantId);
    if (target.isDefault) {
      throw new VariantAlreadyDefaultError(target.sku);
    }
    if (target.isDiscontinued) {
      throw new DiscontinuedVariantNotDefaultableError(target.sku);
    }
    this.refuseCustomDefaultWithoutTiles(target, variantsAsTiles);
    refuseOwnAudienceDefault(target);
    const previous = this.defaultVariant;
    const resolved = this.resolved(target);
    const inherited = {
      allergens: target.follows("allergens"),
      nutrition: target.follows("nutrition"),
    };
    target.promoteToDefault(resolved);
    previous.demote();
    this.assertPricingUnitsAgree();
    return { previousDefaultId: previous.id, inherited };
  }

  /**
   * Aligne une déclinaison sur le défaut, ou l'en détache. L'appartenance est
   * tenue ici, comme pour le tarif.
   *
   * @throws {VariantNotInProductError} la déclinaison n'est pas de la fiche.
   */
  align(variantId: string, aspect: VariantAspect, aligned: boolean): void {
    const variant = this.variants.find((candidate) => candidate.id === variantId);
    if (variant === undefined) {
      throw new VariantNotInProductError(this.productId, variantId);
    }
    variant.alignOnDefault(aspect, aligned);
    this.assertPricingUnitsAgree();
  }

  /**
   * Une déclinaison qui suit le tarif du défaut se vend dans la même unité que
   * lui : sinon le prix au kilo du défaut deviendrait le prix d'une de ses
   * pièces. Tenu après chaque geste qui touche l'unité ou l'alignement.
   */
  assertPricingUnitsAgree(): void {
    const unit = this.defaultVariant.saleUnit;
    const stray = this.variants.find(
      (variant) => variant.pricingFollowsDefault && variant.saleUnit !== unit,
    );
    if (stray !== undefined) {
      throw new PricingAlignmentAcrossUnitsError(stray.sku);
    }
  }

  /**
   * **Le sur mesure du défaut a besoin des vignettes** : une fiche sans
   * vignettes ne paraît au rayon que par son défaut, et sur mesure il
   * disparaîtrait pour tous les pros sans réservation. L'état que le geste
   * laisserait est jugé ici, avant toute mutation.
   *
   * @throws {CustomRecipeDefaultWithoutTilesError}
   */
  refuseCustomDefaultWithoutTiles(
    defaultVariant: Variant,
    variantsAsTiles: boolean,
    customRecipe = defaultVariant.customRecipe,
  ): void {
    if (customRecipe && !variantsAsTiles) {
      throw new CustomRecipeDefaultWithoutTilesError(defaultVariant.sku);
    }
  }
}
