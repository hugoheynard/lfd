import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../entities/variant.js";
import { productCompliance, type ComplianceFinding } from "./product-compliance.js";
import type { CompletenessRules } from "./variant-completeness.js";

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
 * **Ce qui manque pour vendre** — la vue « refus » du jugement unique
 * ({@link productCompliance}) : ses seuls constats BLOQUANTS, rangés par SKU.
 * Aucune règle ici ; elle se lit, elle ne juge pas.
 *
 * Pourquoi taux, contextes, règle du prix pro et allergènes cités arrivent
 * tout résolus : ils dépendent de la famille, de registres et d'un contexte
 * que la fiche ne voit pas. Un objet ne garantit que ce qu'il voit ; le
 * handler lui montre le reste.
 */
export function activationGaps(
  variants: readonly VariantSnapshot[],
  vatPercents: CategoryVatPercents,
  rules: CompletenessRules,
  citedAllergens: readonly string[],
): ActivationGaps {
  return activationGapsOf(productCompliance(variants, vatPercents, rules, citedAllergens));
}

/** Les constats bloquants d'un jugement, sous la forme du refus. */
export function activationGapsOf(findings: readonly ComplianceFinding[]): ActivationGaps {
  const byVariant: Record<string, string[]> = {};
  let allDiscontinued = false;
  for (const finding of findings) {
    if (finding.severity !== "blocking") {
      continue;
    }
    if (finding.code === "all_variants_discontinued") {
      allDiscontinued = true;
    } else if (finding.code === "variant_incomplete") {
      (byVariant[finding.sku] ??= []).push(...finding.missing);
    }
  }
  return { allDiscontinued, byVariant };
}

/** Rien de bloquant ? Lu sur la vue — qui ne porte QUE les constats bloquants. */
export function isActivatable(gaps: ActivationGaps): boolean {
  return !gaps.allDiscontinued && Object.keys(gaps.byVariant).length === 0;
}
