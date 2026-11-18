import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { CatchUpOutputCorrections } from "../application/corrections/catch-up-output-corrections.js";

/**
 * **Au démarrage, rattraper les corrections du fournil** que le colisage n'a
 * pas reçues (D9 de `colisage/plan-niveaux-de-suivi-colisage.md`).
 *
 * Appelé directement, pas par le bus : l'ordre entre l'inscription des
 * gestionnaires et ce démarrage ne se promet pas. Rejoué à chaque démarrage
 * sans rien baisser deux fois. Un échec est journalisé sans empêcher le
 * démarrage : une réserve à corriger vaut mieux qu'une API arrêtée, et le
 * prochain démarrage ou la prochaine correction de l'article la corrigera.
 */
@Injectable()
export class OutputCorrectionsCatchUpOnBoot implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutputCorrectionsCatchUpOnBoot.name);

  constructor(private readonly catchUp: CatchUpOutputCorrections) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const applied = await this.catchUp.execute();
      if (applied > 0) {
        this.logger.warn(`${String(applied)} correction(s) du fournil rattrapée(s) au colisage`);
      }
    } catch (cause) {
      this.logger.error("Rattrapage des corrections du fournil en échec", cause);
    }
  }
}
