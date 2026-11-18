import {
  DetachedVariantNotRestorableError,
  VariantAlreadyDiscontinuedError,
  VariantNotDiscontinuedError,
} from "../errors/variant-lifecycle-errors.js";
import type { VariantSnapshot } from "./variant-snapshot.js";

/**
 * **Le cycle de vie d'une déclinaison** — par défaut ou non, arrêtée ou non,
 * devenue un produit ou non, jamais publiée ou déjà partie à la vente.
 *
 * Un value object immuable : chaque geste rend le nouvel état, ou refuse. Les
 * refus qui dépendent de ses sœurs (le défaut, la dernière vivante) restent
 * ceux de la collection, qui les voit ; ceux qui ne dépendent que d'elle
 * vivent ici, avec la référence (`sku`) qu'ils nomment pour le personnel.
 */
export class VariantLifecycle {
  private constructor(
    /** Le défaut porte la fiche : il ne se détache pas, ne s'arrête pas, ne suit rien. */
    readonly isDefault: boolean,
    /** Hors vente, en base pour toujours : sa référence n'est jamais réattribuée. */
    readonly isDiscontinued: boolean,
    /** Le produit qu'elle est devenue par détachement — ce qui interdit de la désarchiver. */
    readonly detachedToProductId: string | null,
    /** La déclinaison dont elle est la COPIE quand un détachement l'a fait naître ; jamais réécrite. */
    readonly detachedFromVariantId: string | null,
    /**
     * Vrai dès que son produit a été mis en vente avec elle, et pour toujours :
     * une fiche retirée de la vente a pu être commandée. C'est ce qui fige
     * l'unité de vente.
     */
    readonly hasBeenPublished: boolean,
  ) {}

  /** Les champs facultatifs à la LECTURE (absent = `null`) reprennent leur valeur de toute déclinaison. */
  static fromSnapshot(snapshot: VariantSnapshot): VariantLifecycle {
    return new VariantLifecycle(
      snapshot.isDefault,
      snapshot.isDiscontinued,
      snapshot.detachedToProductId ?? null,
      snapshot.detachedFromVariantId ?? null,
      snapshot.hasBeenPublished,
    );
  }

  /**
   * Inscrit qu'elle part à la vente. Irréversible : un retrait de la vente ne
   * rend pas ce qui a pu être commandé entre-temps.
   */
  markPublished(): VariantLifecycle {
    return this.with({ hasBeenPublished: true });
  }

  /**
   * La sort de la vente, sans la supprimer. Irréversible ici : les commandes
   * qui citent sa référence gardent leur sens.
   *
   * @throws {VariantAlreadyDiscontinuedError} déjà arrêtée.
   */
  discontinue(sku: string): VariantLifecycle {
    if (this.isDiscontinued) {
      throw new VariantAlreadyDiscontinuedError(sku);
    }
    return this.with({ isDiscontinued: true });
  }

  /** L'archive en la disant devenue ce produit — le détachement. */
  detachTo(sku: string, productId: string): VariantLifecycle {
    return this.discontinue(sku).with({ detachedToProductId: productId });
  }

  /**
   * La remet en vente, à son rang et sous sa référence d'origine. Refuse celle
   * devenue un produit : elle vit déjà sous une autre fiche, et la remettre en
   * vente vendrait deux fois le même article. `detachedProductLabel` : le nom
   * de ce produit, pour que le refus le dise (la fiche n'en connaît que l'id).
   *
   * @throws {VariantNotDiscontinuedError} elle n'est pas archivée.
   * @throws {DetachedVariantNotRestorableError} elle est devenue un produit.
   */
  restore(sku: string, detachedProductLabel?: string): VariantLifecycle {
    if (!this.isDiscontinued) {
      throw new VariantNotDiscontinuedError(sku);
    }
    if (this.detachedToProductId !== null) {
      throw new DetachedVariantNotRestorableError(
        sku,
        this.detachedToProductId,
        detachedProductLabel,
      );
    }
    return this.with({ isDiscontinued: false });
  }

  /** Cède la place de défaut : un défaut ne suivait rien, elle garde tout ce qu'elle porte. */
  demote(): VariantLifecycle {
    return this.with({ isDefault: false });
  }

  /** Devient la déclinaison par défaut. */
  promote(): VariantLifecycle {
    return this.with({ isDefault: true });
  }

  private with(change: {
    readonly isDefault?: boolean;
    readonly isDiscontinued?: boolean;
    readonly detachedToProductId?: string | null;
    readonly hasBeenPublished?: boolean;
  }): VariantLifecycle {
    return new VariantLifecycle(
      change.isDefault ?? this.isDefault,
      change.isDiscontinued ?? this.isDiscontinued,
      change.detachedToProductId === undefined
        ? this.detachedToProductId
        : change.detachedToProductId,
      this.detachedFromVariantId,
      change.hasBeenPublished ?? this.hasBeenPublished,
    );
  }
}
