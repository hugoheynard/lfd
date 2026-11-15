import { ProductionDay } from "../../domain/entities/production-day.js";

/**
 * La même journée, arrêtée avant la bascule (`legacy`) : depuis K2, une clôture
 * écrit toujours `packing`, et une journée `legacy` ne se relit que de la base.
 * Ses fournées s'annulent encore tout de suite (K2) ; son colisage, lui, n'est
 * plus servi (K3c).
 */
export function legacyOf(day: ProductionDay): ProductionDay {
  return ProductionDay.fromSnapshot({ ...day.toSnapshot(), packingOwner: "legacy" });
}
