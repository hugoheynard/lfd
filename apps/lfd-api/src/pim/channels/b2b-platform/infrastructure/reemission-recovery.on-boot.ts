import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { InterruptOrphanReemissionsHandler } from "../application/interrupt-orphan-reemissions.js";

/**
 * **Au démarrage, clore les réémissions orphelines.**
 *
 * Le gestionnaire est appelé directement, pas par le bus : `CqrsModule` inscrit
 * ses gestionnaires dans son propre `onApplicationBootstrap`, et l'ordre entre
 * deux modules ne se promet pas. Un échec est journalisé sans empêcher le
 * démarrage : un compte rendu resté « en cours » vaut mieux qu'une API
 * arrêtée.
 */
@Injectable()
export class ReemissionRecoveryOnBoot implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReemissionRecoveryOnBoot.name);

  constructor(private readonly interrupt: InterruptOrphanReemissionsHandler) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const closed = await this.interrupt.execute();
      if (closed > 0) {
        this.logger.warn(
          `${closed} réémission(s) interrompue(s) par le redémarrage, closes en échec`,
        );
      }
    } catch (cause) {
      this.logger.error("Reprise des réémissions orphelines en échec", cause);
    }
  }
}
