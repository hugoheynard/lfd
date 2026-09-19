import { SalesContextNotFoundError } from "../../sales-contexts/domain/errors/sales-context-errors.js";
import { SalesContextRegistry } from "../../sales-contexts/domain/ports/sales-context.registry.js";
import { PointOfSaleNotFoundError } from "../domain/errors/points-of-sale-errors.js";
import type { PointOfSale } from "../domain/entities/point-of-sale.js";
import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";

/**
 * Les contextes qu'un point de vente offre, cités au journal avec leur libellé
 * **du moment** (D5 du plan des phrases du journal). L'`id` est la clé du
 * contexte : c'est sous elle qu'il écrit ses propres faits.
 *
 * @throws {SalesContextNotFoundError} une clé que le registre ignore — la base
 *   la refuserait de toute façon (clé étrangère sur `context_key`).
 */
export async function namedContexts(
  keys: readonly string[],
  contexts: SalesContextRegistry,
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  const labels = new Map((await contexts.all()).map((context) => [context.key, context.label]));
  return keys.map((key) => {
    const label = labels.get(key);
    if (label === undefined) {
      throw new SalesContextNotFoundError(key);
    }
    return { id: key, name: label };
  });
}

/** Charge un point de vente, ou refuse. */
export async function requirePointOfSale(
  points: PointOfSaleRepository,
  id: string,
): Promise<PointOfSale> {
  const pointOfSale = await points.findById(id);
  if (pointOfSale === null) {
    throw new PointOfSaleNotFoundError(id);
  }
  return pointOfSale;
}
