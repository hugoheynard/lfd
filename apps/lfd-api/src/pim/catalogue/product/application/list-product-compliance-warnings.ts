import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductComplianceFinding, ProductComplianceWarningView } from "@lfd/pim-contracts";

import { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import type { ComplianceFinding } from "../domain/services/product-compliance.js";
import { CitedAllergensReader } from "../domain/ports/cited-allergens.reader.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { readCompletenessRules } from "./completeness-support.js";

/** Les fiches non archivées qui portent au moins un constat de conformité. */
export class ListProductComplianceWarningsQuery {}

/**
 * **Ce que la table des produits signale** — le jugement unique
 * (`Product.complianceWith`, celui qui accepte ou refuse l'activation) sur
 * toutes les fiches non archivées, quel que soit leur statut : une publiée ou
 * une activable peuvent porter un avertissement.
 *
 * Taux, contextes, règle du prix pro et allergènes cités sont lus UNE fois
 * pour toute la liste, jamais par fiche — comme `ListProductsHandler`.
 *
 * 🔴 Une fiche absente n'est PAS certifiée conforme (D5) : la composition est
 * éditoriale ; seule l'absence de déclaration (précaution) se signale.
 */
@QueryHandler(ListProductComplianceWarningsQuery)
export class ListProductComplianceWarningsHandler implements IQueryHandler<
  ListProductComplianceWarningsQuery,
  ProductComplianceWarningView[]
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly catalogue: CatalogueReader,
    private readonly contexts: ActiveSalesContextsReader,
    private readonly cited: CitedAllergensReader,
  ) {}

  async execute(): Promise<ProductComplianceWarningView[]> {
    const [all, rules] = await Promise.all([
      this.products.listAll(),
      readCompletenessRules(this.contexts),
    ]);
    const live = all.filter((product) => product.status !== "archived");
    const [vat, cited] = await Promise.all([
      this.catalogue.vatPercents(live.map((product) => product.snapshot())),
      this.cited.ofProducts(live.map((product) => product.id)),
    ]);
    return live.flatMap((product) => {
      const warnings = product.complianceWith(
        vat.get(product.id) ?? {},
        rules,
        cited.get(product.id) ?? [],
      );
      return warnings.length === 0
        ? []
        : [{ productId: product.id, warnings: warnings.map(toView) }];
    });
  }
}

/** Le constat tel que le contrat le sert — des tableaux à soi, rien de partagé. */
function toView(finding: ComplianceFinding): ProductComplianceFinding {
  if (finding.code === "all_variants_discontinued") {
    return { ...finding };
  }
  if (finding.code === "variant_incomplete") {
    return { ...finding, missing: [...finding.missing] };
  }
  return { ...finding };
}
