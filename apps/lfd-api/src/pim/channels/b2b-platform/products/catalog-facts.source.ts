import { Injectable } from "@nestjs/common";
import { SOURCE_LOCALE } from "@lfd/pim-contracts";

import { readCompletenessRules } from "../../../catalogue/product/application/completeness-support.js";
import { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { IncoProjector } from "../../../allergens/domain/services/inco-projector.js";
import { CitedAllergensReader } from "../../../catalogue/product/domain/ports/cited-allergens.reader.js";
import { EditorialReader } from "../../../catalogue/product/domain/ports/editorial-reader.js";
import {
  CatalogFactsReader,
  type CatalogFamilyRecord,
} from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import type { CategoryVatPercents } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { effectiveVat } from "../../../catalogue/shared/domain/value-objects/context-vat.js";
import { VatRateRepository } from "../../../vat-rates/domain/ports/vat-rate.repository.js";
import {
  projectFamilyFact,
  projectProductFact,
  type CatalogFamilyFactBody,
  type CatalogProductFactBody,
} from "./catalog-facts.js";
import { CatalogSnapshots } from "./catalog-snapshots.js";
import { showcaseOf } from "./showcase.js";

/**
 * **Relit et projette** les fiches et les familles qu'un fait va décrire.
 *
 * Toutes les lectures passent par des ports qui suivent la transaction
 * ambiante : appelé par l'émetteur APRÈS son verrou, il voit ce que le geste
 * vient d'écrire — fiche, satellites (allergènes, rédactionnel, visuels) et
 * réglages (taux, rapport pro, contextes en service, référentiel d'allergènes),
 * et ce que la composition de chaque fiche cite (`CitedAllergensReader`).
 *
 * Séparé de l'émetteur (SRP) : celui-ci tient l'ordre (verrou, numéro,
 * boîte d'envoi) ; celui-là sait seulement ce qu'une fiche est devenue.
 */
@Injectable()
export class CatalogFactsSource extends CatalogSnapshots {
  constructor(
    private readonly facts: CatalogFactsReader,
    private readonly rates: VatRateRepository,
    private readonly contexts: ActiveSalesContextsReader,
    private readonly allergens: AllergenCatalogueReader,
    private readonly editorials: EditorialReader,
    private readonly cited: CitedAllergensReader,
  ) {
    super();
  }

  /** L'instantané de chaque fiche trouvée, par identifiant. */
  async products(ids: readonly string[]): Promise<ReadonlyMap<string, CatalogProductFactBody>> {
    const products = await this.facts.products(ids);
    if (products.length === 0) {
      return new Map();
    }
    const familyIds = [...new Set(products.map((product) => product.categoryId))];
    const [families, percentOf, rules, catalogue, notes, medias, cited] = await Promise.all([
      this.facts.families(familyIds),
      this.percentIndex(),
      readCompletenessRules(this.contexts),
      this.allergens.catalogue(),
      this.editorials.findByProducts(ids),
      this.editorials.mediaOfProducts(ids),
      this.cited.ofProducts(ids),
    ]);
    const familyById = new Map(families.map((family) => [family.id, family]));
    const inco = IncoProjector.from(catalogue, SOURCE_LOCALE);
    const showcase = showcaseOf(products, notes, medias);
    const bodies = new Map<string, CatalogProductFactBody>();
    for (const product of products) {
      const family = familyById.get(product.categoryId);
      if (family === undefined) {
        // Une clé étrangère tient ce lien en base : une fiche sans famille ne
        // se relit pas, et ne s'invente pas.
        continue;
      }
      bodies.set(
        product.id,
        projectProductFact({
          product,
          family,
          familyPercents: resolve(family.vatByContext, percentOf),
          percents: resolve(effectiveVat(family.vatByContext, product.vatByContext), percentOf),
          rules,
          inco,
          showcase: showcase.get(product.id),
          cited: cited.get(product.id) ?? [],
        }),
      );
    }
    return bodies;
  }

  /** L'instantané de chaque famille trouvée, par identifiant. */
  async families(ids: readonly string[]): Promise<ReadonlyMap<string, CatalogFamilyFactBody>> {
    const [families, percentOf] = await Promise.all([
      this.facts.families(ids),
      this.percentIndex(),
    ]);
    return new Map(
      families.map((family: CatalogFamilyRecord) => [
        family.id,
        projectFamilyFact(family, resolve(family.vatByContext, percentOf)),
      ]),
    );
  }

  private async percentIndex(): Promise<ReadonlyMap<string, number>> {
    const rates = await this.rates.listAll();
    return new Map(rates.map((rate) => [rate.id, rate.percent]));
  }
}

/** Identifiants de taux → pourcentages ; un taux disparu n'a pas d'entrée — jamais inventé. */
function resolve(
  vatByContext: Readonly<Record<string, string>>,
  percentOf: ReadonlyMap<string, number>,
): CategoryVatPercents {
  const percents: Record<string, number> = {};
  for (const [contextKey, rateId] of Object.entries(vatByContext)) {
    const percent = percentOf.get(rateId);
    if (percent !== undefined) {
      percents[contextKey] = percent;
    }
  }
  return percents;
}
