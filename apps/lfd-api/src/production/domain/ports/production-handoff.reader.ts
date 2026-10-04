import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Quelles fournées ont été remises au colisage** — port de LECTURE, séparé
 * du registre (ISP) : l'annulation le lit, la déclaration ne le lit pas.
 *
 * Une fournée déclarée avant K1, ou implicite, n'a pas de remise : l'annuler
 * ne demande donc aucun retour au colisage, qui ne l'a jamais reçue.
 */
export abstract class ProductionHandoffReader {
  /** Parmi `batchIds`, ceux qui portent une remise ce jour-là. */
  abstract handedAmong(day: ServiceDay, batchIds: readonly string[]): Promise<ReadonlySet<string>>;
}
