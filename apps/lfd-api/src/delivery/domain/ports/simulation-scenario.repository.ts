import type { SimulationScenario } from "../entities/simulation-scenario.js";

/**
 * Port d'**écriture** des scénarios du simulateur (L9-C7) : on charge
 * l'agrégat, il se mute par ses méthodes, on le rend.
 */
export abstract class SimulationScenarioRepository {
  /** Le scénario, archivé ou non ; `null` s'il n'a jamais existé. */
  abstract load(id: string): Promise<SimulationScenario | null>;

  /**
   * Écrit l'agrégat (création ou mise à jour). Un contenu illisible n'est pas
   * réécrit : archiver un scénario qui ne se relit plus garde ce qu'il portait.
   * @throws {SimulationScenarioNameTakenError} l'index partiel a refusé le nom
   * — une course que la lecture préalable n'a pas vue.
   */
  abstract save(scenario: SimulationScenario): Promise<void>;

  /** Un scénario NON archivé, autre que `exceptId`, porte-t-il déjà ce nom ? */
  abstract nameTaken(name: string, exceptId: string | null): Promise<boolean>;
}
