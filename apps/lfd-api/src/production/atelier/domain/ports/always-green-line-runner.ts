import type { ServiceDay } from "../../../day/index.js";
import type { AlwaysGreenLineOutcome } from "../services/always-green.js";

/**
 * **Passer une ligne en toujours vert** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) — ce que le tour
 * du cron demande pour chaque ligne. Le tour ne connaît pas le handler de la
 * ligne : l'adaptateur envoie la commande sur le bus, chaque ligne dans sa
 * propre unité de travail.
 */
export abstract class AlwaysGreenLineRunner {
  /** @throws ce que la commande de la ligne refuse ; le tour l'isole. */
  abstract run(day: ServiceDay, sku: string): Promise<AlwaysGreenLineOutcome>;
}
