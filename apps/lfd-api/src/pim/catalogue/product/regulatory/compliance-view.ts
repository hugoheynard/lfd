import type { ProductComplianceFinding } from "@lfd/pim-contracts";

import type { CategoryVatPercents } from "../../shared/domain/ports/catalogue-reader.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";
import type { Product } from "../domain/entities/product.js";
import { isLiveStatus } from "../domain/ports/product.repository.js";
import type { ComplianceFinding } from "../domain/services/product-compliance.js";
import type { CompletenessRules } from "../domain/services/variant-completeness.js";

/** Ce que la fiche ne voit pas d'elle-même, résolu une fois pour toutes les fiches lues. */
export interface ComplianceInputs {
  readonly vat: CategoryVatPercents;
  readonly rules: CompletenessRules;
  readonly citedAllergens: readonly string[];
  readonly categoryAudience: Audience;
}

/**
 * Les constats d'UNE fiche — le jugement unique (`Product.complianceWith`,
 * celui qui accepte ou refuse l'activation), sur une fiche vivante seulement :
 * archivées et supprimées ne partent nulle part, elles n'ont rien à corriger.
 *
 * Partagé par la liste des fiches et par `compliance-warnings` : deux cas qui
 * se partagent le domaine, pas leurs handlers (CLAUDE.md §4).
 */
export function complianceFindingsOf(
  product: Product,
  inputs: ComplianceInputs,
): ProductComplianceFinding[] {
  if (!isLiveStatus(product.status)) {
    return [];
  }
  return product
    .complianceWith(inputs.vat, inputs.rules, inputs.citedAllergens, inputs.categoryAudience)
    .map(toView);
}

/** Le constat tel que le contrat le sert — des tableaux à soi, rien de partagé. */
function toView(finding: ComplianceFinding): ProductComplianceFinding {
  if (finding.code === "variant_incomplete") {
    return { ...finding, missing: [...finding.missing] };
  }
  return { ...finding };
}
