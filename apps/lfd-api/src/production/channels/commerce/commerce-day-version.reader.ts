import type { ServiceDay } from "../../day/domain/value-objects/service-day.value-object.js";

/**
 * **« Les commandes de cette journée ont-elles bougé ? »** — port que le
 * fournil DÉCLARE et que le commerce implémente (
 * `documentation/fournil/dossier-prod-du-jour.md`).
 *
 * L'impression provisoire garde la version lue à son tirage ; la fenêtre
 * suivante compare, et dit « la journée a changé depuis #N ». Le fournil ne
 * lit pas le journal du commerce : il reçoit un numéro.
 */
export abstract class CommerceDayVersionReader {
  /**
   * Le numéro du journal du commerce pour ce jour, `0` si aucun. Opaque,
   * croissant : il se compare, il ne compte rien.
   */
  abstract versionOf(day: ServiceDay): Promise<number>;
}
