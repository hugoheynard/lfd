import {
  SaleReferenceUsage,
  type SaleReferenceQuery,
} from "../../../channels/b2b-platform/sale-reference-usage/sale-reference-usage.js";
import type { SaleUnitClearance } from "../domain/value-objects/sale-reference-usage.js";

/**
 * **Lire le commerce, et rendre une réponse que le domaine juge** — par lot,
 * une entrée par déclinaison demandée.
 *
 * Une panne du port n'est pas levée ici : elle devient `answered: false`, et
 * c'est le domaine (au changement d'unité) ou l'écran (à la lecture) qui en
 * fait un refus ou un avertissement. Une déclinaison absente de la réponse
 * est traitée de même : le commerce n'a rien dit d'elle.
 */
export async function clearancesOf(
  usage: SaleReferenceUsage,
  references: readonly SaleReferenceQuery[],
): Promise<ReadonlyMap<string, SaleUnitClearance>> {
  if (references.length === 0) {
    return new Map();
  }
  try {
    const answered = await usage.usesOf(references);
    return new Map(
      references.map((reference): [string, SaleUnitClearance] => {
        const uses = answered.get(reference.sku);
        return [
          reference.sku,
          uses === undefined
            ? { answered: false, cause: `aucune réponse pour ${reference.sku}` }
            : { answered: true, uses },
        ];
      }),
    );
  } catch (cause: unknown) {
    return new Map(
      references.map((reference): [string, SaleUnitClearance] => [
        reference.sku,
        { answered: false, cause },
      ]),
    );
  }
}
