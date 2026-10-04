import type { StationOrderRef } from "../../channels/packing/packing-station.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";

/**
 * **La commande à remettre au poste du colisage**, après les refus
 * STRUCTURELS que le fournil garde (K2) : journée arrêtée, référence au plan
 * (`sheetToPack`). Le reste — bac, lignes, réserve — est la règle du colisage.
 *
 * `null` = la journée est colisée par l'ancien poste (`legacy`) : l'appelant
 * suit l'ancien chemin. Une journée garde le propriétaire de sa clôture (§13 B1).
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
 */
export function stationOrderOf(day: ProductionDay, reference: string): StationOrderRef | null {
  if (day.packingOwner !== "packing") {
    return null;
  }
  const sheet = day.sheetToPack(reference);
  return { serviceDay: day.day.value, orderId: sheet.orderId, reference };
}
