import type { DomainError } from "../../../platform/shared/errors/app-error.js";
import { InvalidRequestedQuantityError } from "./site-resupply-errors.js";
import type { SaleUnit } from "./resupply-sale-unit.js";

/** Au plus 200 articles dans une composition — la borne du contrat. */
export const RESUPPLY_LIST_MAX_LINES = 200;

/**
 * **Une ligne de composition** : un article, sa quantité et son unité, sans
 * libellé — l'écran le lit au catalogue. Au poids, la quantité compte des
 * grammes. La forme d'un brouillon du fournil comme d'un modèle de réassort.
 */
export interface ResupplyListLine {
  readonly sku: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/**
 * Les refus d'une composition, nommés par l'agrégat qui l'emploie : un
 * brouillon et un modèle partagent la règle, chacun garde ses mots et ses
 * codes publics.
 */
export interface ResupplyListRefusals {
  empty(): DomainError;
  tooMany(max: number): DomainError;
  blankSku(): DomainError;
  duplicate(sku: string): DomainError;
}

/**
 * **La règle d'une composition** : au moins une ligne, au plus
 * {@link RESUPPLY_LIST_MAX_LINES}, des SKU rognés non vides, une quantité
 * entière ≥ 1, et un même article une fois — l'écran envoie une quantité par
 * article, un doublon dit une erreur de l'écran. Les SKU ne sont pas lus au
 * catalogue : un article retiré se constate là où la composition sert.
 *
 * @throws {InvalidRequestedQuantityError} une quantité non entière ou < 1.
 */
export function resupplyListOf(
  lines: readonly ResupplyListLine[],
  refusals: ResupplyListRefusals,
): readonly ResupplyListLine[] {
  if (lines.length === 0) {
    throw refusals.empty();
  }
  if (lines.length > RESUPPLY_LIST_MAX_LINES) {
    throw refusals.tooMany(RESUPPLY_LIST_MAX_LINES);
  }
  const seen = new Set<string>();
  return lines.map((line) => {
    const sku = line.sku.trim();
    if (sku === "") {
      throw refusals.blankSku();
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new InvalidRequestedQuantityError(line.quantity);
    }
    if (seen.has(sku)) {
      throw refusals.duplicate(sku);
    }
    seen.add(sku);
    return { sku, quantity: line.quantity, saleUnit: line.saleUnit };
  });
}
