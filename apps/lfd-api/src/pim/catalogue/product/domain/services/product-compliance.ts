import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { VariantSnapshot } from "../entities/variant.js";
import { variantGaps, type CompletenessRules } from "./variant-completeness.js";

/** `blocking` refuse l'activation ; `warning` se signale sans rien refuser. */
export type ComplianceSeverity = "blocking" | "warning";

/**
 * 🔴 **La sévérité d'une contradiction composition ↔ allergènes** — UNE ligne.
 * Bloquante par décision de Hugo (2026-10-27) : une fiche qui déclare « aucun
 * allergène » et cite la farine ne s'active pas. Une fiche DÉJÀ publiée n'est
 * ni retirée ni modifiée : elle apparaît en constat bloquant dans la liste.
 */
export const ALLERGEN_CONTRADICTION_SEVERITY: ComplianceSeverity = "blocking";

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
 * La composition cite un allergène que la déclaration de la déclinaison ne
 * porte pas — `allergens_contradict_none` quand elle affirme « aucun » (`[]`).
 * Une déclinaison sans déclaration n'est jamais comparée (D5).
 */
export interface AllergenContradictionFinding {
  readonly code: "allergens_cited_not_declared" | "allergens_contradict_none";
  readonly severity: ComplianceSeverity;
  readonly variantId: string;
  readonly sku: string;
  readonly allergenCodes: readonly string[];
}

export type ComplianceFinding =
  AllVariantsDiscontinuedFinding | VariantIncompleteFinding | AllergenContradictionFinding;

/**
 * **Le jugement UNIQUE d'une fiche** — activation, refus de `publish`, champ
 * `activatable` de la liste et avertissements de la table en dérivent tous.
 *
 * Pure, sur les déclinaisons RÉSOLUES (une alignée porte la déclaration du
 * défaut). Ce que la fiche ne voit pas arrive résolu : taux, contextes et
 * règle du prix pro, et les allergènes que ses ingrédients cités portent —
 * le catalogue ne lit pas les ingrédients, son handler les lui montre.
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
  return [...incomplete, ...allergenContradictions(live, citedAllergens)];
}

/** Aucun constat bloquant. */
export function isCompliantForActivation(findings: readonly ComplianceFinding[]): boolean {
  return findings.every((finding) => finding.severity !== "blocking");
}

/**
 * Les codes cités par la composition et absents de la déclaration — une
 * proposition d'AJOUT, jamais un retrait (une contamination d'atelier
 * déclarée à la main n'est pas contredite). Sans déclaration (`null`), vide :
 * fabriquer une fiche réglementaire depuis une liste éditoriale est le geste
 * que D5 interdit. Partagée avec la lecture de la composition d'une fiche.
 */
export function citedNotDeclared(
  declared: readonly string[] | null,
  citedAllergens: readonly string[],
): string[] {
  return declared === null ? [] : citedAllergens.filter((code) => !declared.includes(code));
}

function allergenContradictions(
  live: readonly VariantSnapshot[],
  citedAllergens: readonly string[],
): AllergenContradictionFinding[] {
  return live.flatMap((variant) => {
    const declared = variant.allergenSheet?.declared ?? null;
    const missing = citedNotDeclared(declared, citedAllergens);
    if (missing.length === 0) {
      return [];
    }
    return [
      {
        code: declared?.length === 0 ? "allergens_contradict_none" : "allergens_cited_not_declared",
        severity: ALLERGEN_CONTRADICTION_SEVERITY,
        variantId: variant.id,
        sku: variant.sku,
        allergenCodes: missing,
      },
    ];
  });
}
