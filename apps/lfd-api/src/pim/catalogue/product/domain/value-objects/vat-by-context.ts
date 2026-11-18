import { ProductUnknownContextError } from "../errors/product-errors.js";
import type { SalesContext } from "../../../../reference/sales-contexts/domain/value-objects/sales-context.js";
import type { ContextVat } from "../../../shared/domain/value-objects/context-vat.js";

/**
 * **La dérogation de TVA d'une fiche**, par clé de contexte de vente — les
 * taux propres à CE produit, qui priment sur ceux de sa famille. Clé absente =
 * il hérite, et c'est le cas courant.
 *
 * Une carte vide n'est pas une dérogation vide : c'est le retour au taux de la
 * famille, et c'est ce qui rend le geste réversible sans écrire un état « pas
 * de dérogation » qui ressemblerait à une décision.
 *
 * Un seul refus : le contexte doit exister au registre. Un contexte que la
 * fiche ne vend pas se règle — la matrice ne décide plus de la TVA. Ce que la
 * fiche ne voit pas (un taux qui sert encore, une famille) reste aux handlers.
 */
export class VatByContext {
  private constructor(private readonly byContext: ContextVat) {}

  /** Une fiche naît SANS dérogation : elle suit sa famille jusqu'à ce que quelqu'un décide le contraire. */
  static none(): VatByContext {
    return new VatByContext({});
  }

  /** Relit une dérogation déjà posée : elle a été validée à son écriture. */
  static reconstitute(byContext: ContextVat): VatByContext {
    return new VatByContext(byContext);
  }

  /**
   * Pose une dérogation, ou revient à l'héritage avec une carte vide.
   *
   * @throws {ProductUnknownContextError} une clé ne désigne aucun contexte du registre.
   */
  static declare(byContext: ContextVat, contexts: readonly SalesContext[]): VatByContext {
    const known = new Set(contexts.map((context) => context.key));
    for (const key of Object.keys(byContext)) {
      if (!known.has(key)) {
        throw new ProductUnknownContextError(key);
      }
    }
    return new VatByContext({ ...byContext });
  }

  /** La carte telle qu'on la sert et la persiste. */
  toMap(): ContextVat {
    return this.byContext;
  }

  /** Une copie pour une fiche née d'un détachement : les deux ne partagent aucune carte. */
  copy(): VatByContext {
    return new VatByContext({ ...this.byContext });
  }
}
