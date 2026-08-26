import { PointOfSaleNotFoundError } from "../domain/errors/points-of-sale-errors.js";
import type { PointOfSale } from "../domain/entities/point-of-sale.js";
import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";

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
