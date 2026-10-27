import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../entities/variant.js";
import { effectiveAllergens } from "./effective-allergens.js";
import { variantGaps, type CompletenessRules } from "./variant-completeness.js";

/** `blocking` refuse l'activation ; `warning` se signale sans rien refuser. */
export type ComplianceSeverity = "blocking" | "warning";

/** Toutes les déclinaisons sont arrêtées : rien ne se vendrait. */
export interface AllVariantsDiscontinuedFinding {
  readonly code: "all_variants_discontinued";
  readonly severity: ComplianceSeverity;
}

/**
 * Une déclinaison non arrêtée à qui il manque de quoi se vendre — les clés
 * de {@link variantGaps}. Bloquante quand AUCUNE n'est complète (une seule
 * suffit à activer) ; un avertissement sinon.
 */
export interface VariantIncompleteFinding {
  readonly code: "variant_incomplete";
  readonly severity: ComplianceSeverity;
  readonly variantId: string;
  readonly sku: string;
  readonly missing: readonly string[];
}

/**
 * Une déclinaison sans déclaration d'allergènes, servie PAR PRÉCAUTION
 * (règle B de `plan-allergenes-jamais-bloquants.md`, 2026-10-27) : allergènes
 * de sa composition, traces de tout le catalogue. Toujours un avertissement —
 * la fiche se publie, le constat est là pour qu'elle ne le reste pas.
 */
export interface AllergensPrecautionaryFinding {
  readonly code: "allergens_precautionary";
  readonly severity: "warning";
  readonly variantId: string;
  readonly sku: string;
}

export type ComplianceFinding =
  AllVariantsDiscontinuedFinding | VariantIncompleteFinding | AllergensPrecautionaryFinding;

/**
 * **Le jugement UNIQUE d'une fiche** — activation, refus de `publish`, champ
 * `activatable` de la liste et avertissements de la table en dérivent tous.
 *
 * Pure, sur les déclinaisons RÉSOLUES (une alignée porte la déclaration du
 * défaut). Ce que la fiche ne voit pas arrive résolu : taux, contextes et
 * règle du prix pro, et les allergènes que ses ingrédients cités portent —
 * le catalogue ne lit pas les ingrédients, son handler les lui montre.
 *
 * Les allergènes ne refusent plus rien (2026-10-27) : la règle A corrige ce
 * que la composition cite, sans constat ; la règle B signale seulement.
 *
 * Une déclinaison arrêtée n'est jugée sur rien : elle ne se vend plus.
 */
export function productCompliance(
  variants: readonly VariantSnapshot[],
  vatPercents: CategoryVatPercents,
  rules: CompletenessRules,
  citedAllergens: readonly string[],
): ComplianceFinding[] {
  const live = variants.filter((variant) => !variant.isDiscontinued);
  if (live.length === 0) {
    return [{ code: "all_variants_discontinued", severity: "blocking" }];
  }
  const judged = live.map((variant) => ({
    variant,
    missing: variantGaps(variant, vatPercents, rules),
  }));
  const severity: ComplianceSeverity = judged.some((entry) => entry.missing.length === 0)
    ? "warning"
    : "blocking";
  const incomplete: ComplianceFinding[] = judged
    .filter((entry) => entry.missing.length > 0)
    .map(({ variant, missing }) => ({
      code: "variant_incomplete",
      severity,
      variantId: variant.id,
      sku: variant.sku,
      missing,
    }));
  return [...incomplete, ...precautionary(live, citedAllergens)];
}

/** Aucun constat bloquant. */
export function isCompliantForActivation(findings: readonly ComplianceFinding[]): boolean {
  return findings.every((finding) => finding.severity !== "blocking");
}

/** Les déclinaisons servies par précaution — {@link effectiveAllergens}, règle B. */
function precautionary(
  live: readonly VariantSnapshot[],
  citedAllergens: readonly string[],
): AllergensPrecautionaryFinding[] {
  return live
    .filter(
      (variant) => effectiveAllergens(variant.allergenSheet, citedAllergens, []).precautionary,
    )
    .map((variant) => ({
      code: "allergens_precautionary",
      severity: "warning",
      variantId: variant.id,
      sku: variant.sku,
    }));
}
