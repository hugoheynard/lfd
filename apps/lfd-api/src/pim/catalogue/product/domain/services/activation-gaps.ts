import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../entities/variant.js";
import { variantGaps, type CompletenessRules } from "./variant-completeness.js";

/**
 * Ce qui empêche une fiche d'être activée.
 *
 * Activable = au moins une déclinaison non arrêtée **complète** (lot 2b de
 * `plan-catalogue-synchronise-par-audience.md`, C1 et 2b3). Les autres
 * n'empêchent rien : la projection des faits les écarte de la vente, elles
 * restent invendables par construction.
 */
export interface ActivationGaps {
  /** Toutes les déclinaisons sont arrêtées : rien ne se vendrait. */
  readonly allDiscontinued: boolean;
  /**
   * SKU → ce qui lui manque, pour chaque déclinaison non arrêtée — renseignée
   * seulement quand AUCUNE n'est complète : une seule suffit à activer.
   */
  readonly byVariant: Readonly<Record<string, readonly string[]>>;
}

/**
 * **Ce qui manque pour vendre** — fonction pure, jugée sur les déclinaisons
 * RÉSOLUES (une déclinaison alignée porte le prix et les allergènes du
 * défaut), par la règle de complétude partagée avec les faits du catalogue
 * (`variantGaps`).
 *
 * Pourquoi taux, contextes et règle du prix pro arrivent tout résolus : ils
 * dépendent de la famille et de registres que la fiche ne voit pas. Un objet
 * ne garantit que ce qu'il voit ; le handler lui montre le reste.
 */
export function activationGaps(
  variants: readonly VariantSnapshot[],
  vatPercents: CategoryVatPercents,
  rules: CompletenessRules,
): ActivationGaps {
  const live = variants.filter((variant) => !variant.isDiscontinued);
  const judged = live.map((variant) => ({
    sku: variant.sku,
    missing: variantGaps(variant, vatPercents, rules),
  }));
  const complete = judged.some((entry) => entry.missing.length === 0);
  return {
    allDiscontinued: live.length === 0,
    byVariant: complete
      ? {}
      : Object.fromEntries(judged.map((entry) => [entry.sku, entry.missing])),
  };
}

/** Rien ne manque ? */
export function isActivatable(gaps: ActivationGaps): boolean {
  return !gaps.allDiscontinued && Object.keys(gaps.byVariant).length === 0;
}
