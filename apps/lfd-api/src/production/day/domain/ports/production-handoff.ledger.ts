import type { ProductionHandoff } from "../services/production-handoff.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le registre des remises au colisage** — port d'ÉCRITURE, en ajout seul
 * (plan `colisage/colisage.md`, §10.3).
 *
 * Une écriture nue, et c'est le cas que le §3.1 autorise : une ligne par geste,
 * jamais modifiée, sans règle qui puisse la refuser en K1 — la remise suit la
 * fournée que l'agrégat vient de laisser passer. K2 fera lire `Σ quantity` par
 * les gardes des fournées ; elle entrera alors dans la journée.
 */
export abstract class ProductionHandoffLedger {
  /**
   * Écrit la ligne si son `id` est libre ; sinon ne fait rien. Une déclaration
   * rejouée calcule le même `id` : elle ne remet pas deux fois.
   */
  abstract record(day: ServiceDay, handoff: ProductionHandoff): Promise<void>;
}
