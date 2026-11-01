import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { InterruptOrphanRuns } from "../application/interrupt-orphan-runs.js";

/**
 * Au démarrage, interrompt toute application laissée `running` (§ 7.3 :
 * une seule instance, donc forcément orpheline). Un échec ne fait pas tomber l'API : la ligne reste `running`,
 * la seconde application est refusée, et le démarrage suivant réessaie.
 */
@Injectable()
export class InterruptOrphanRunsOnBoot implements OnApplicationBootstrap {
  private readonly logger = new Logger(InterruptOrphanRunsOnBoot.name);

  constructor(private readonly sweep: InterruptOrphanRuns) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const interrupted = await this.sweep.execute();
      if (interrupted > 0) {
        this.logger.warn(
          `${String(interrupted)} opération(s) après déploiement interrompue(s) par le changement d'image.`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Le balayage des opérations après déploiement en cours a échoué ; elles restent « en cours » jusqu'au prochain démarrage : ${String(error)}`,
      );
    }
  }
}
