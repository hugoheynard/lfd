import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Quelles fournées ont été remises au colisage** — port de LECTURE, séparé
 * du registre (ISP) : l'annulation le lit, la déclaration ne le lit pas.
 *
 * Une fournée déclarée avant K1, ou implicite, n'a pas de remise : l'annuler
 * ne demande donc aucun retour au colisage, qui ne l'a jamais reçue.
 */
export abstract class ProductionHandoffReader {
  /**
   * Parmi `batchIds`, ceux qui portent une remise ce jour-là, avec la quantité
   * remise — la fournée entière, ou moins quand un réassort servi sur place
   * en a gardé une part (R3c).
   */
  abstract handedAmong(
    day: ServiceDay,
    batchIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;
}
