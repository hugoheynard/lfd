import { Injectable } from "@nestjs/common";

import { VatRateRepository } from "../../../reference/vat-rates/domain/ports/vat-rate.repository.js";
import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";
import { FamilyVatReader } from "../../category/domain/ports/family-vat.reader.js";
import { effectiveVat } from "../../shared/domain/value-objects/context-vat.js";
import {
  type CategoryVatPercents,
  resolvePercents,
} from "../../shared/domain/value-objects/vat-percents.js";
import { EffectiveVatReader, type VatFamily } from "../domain/ports/effective-vat.reader.js";
import type { ProductRecord } from "../domain/ports/product.repository.js";

/**
 * L'adaptateur : les taux d'une famille par la lecture que la famille publie
 * (`FamilyVatReader`), les pourcentages par le référentiel des taux, lus une
 * fois et indexés — résoudre famille par famille ferait N+1 requêtes pour une
 * table qui tient en quelques lignes.
 */
@Injectable()
export class ResolvedEffectiveVatReader extends EffectiveVatReader {
  constructor(
    private readonly families: FamilyVatReader,
    private readonly rates: VatRateRepository,
  ) {
    super();
  }

  async vatPercents(
    products: readonly ProductRecord[],
    families?: readonly VatFamily[],
  ): Promise<ReadonlyMap<string, CategoryVatPercents>> {
    const rates = await this.rates.listAll();
    const percentById = new Map(rates.map((rate) => [rate.id, rate.percent]));
    const resolved = new Map<string, CategoryVatPercents>();
    // Une famille est lue UNE fois, même quand cent fiches la partagent ;
    // passée par l'appelant, elle n'est pas relue du tout.
    const known = new Map<string, Readonly<Record<string, string>>>(
      (families ?? []).map((family) => [family.id, family.vatByContext]),
    );
    for (const product of products) {
      const family =
        known.get(product.categoryId) ??
        (families === undefined ? await this.families.vatOf(product.categoryId) : undefined);
      if (family === undefined) {
        throw new CategoryNotFoundError(product.categoryId);
      }
      known.set(product.categoryId, family);
      resolved.set(
        product.id,
        resolvePercents(effectiveVat(family, product.vatByContext), percentById),
      );
    }
    return resolved;
  }
}
