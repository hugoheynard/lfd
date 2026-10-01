import type { PurchaseScenario } from "../entities/purchase-scenario.js";

/**
 * Port d'**écriture** des scénarios d'achat (B-D5) : on charge l'agrégat, il
 * se mute par ses méthodes, on le rend.
 */
export abstract class PurchaseScenarioRepository {
  /** Le scénario, archivé ou non ; `null` s'il n'a jamais existé. */
  abstract load(id: string): Promise<PurchaseScenario | null>;

  /**
   * Écrit l'agrégat (création ou mise à jour). Un contenu illisible n'est pas
   * réécrit : archiver un scénario qui ne se relit plus garde ce qu'il portait.
   * @throws {PurchaseScenarioNameTakenError} l'index partiel a refusé le nom
   * — une course que la lecture préalable n'a pas vue.
   */
  abstract save(scenario: PurchaseScenario): Promise<void>;

  /** Un scénario NON archivé, autre que `exceptId`, porte-t-il déjà ce nom ? */
  abstract activeNameTaken(name: string, exceptId: string): Promise<boolean>;
}
