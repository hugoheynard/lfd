import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { DeployedRevision } from "../domain/deployed-revision.js";
import { PostDeployRunRepository } from "../domain/post-deploy-run.repository.js";

/**
 * **Le balayage au démarrage** (§ 7.3) : TOUTE application `running` passe à
 * `interrupted`, quelle que soit sa révision. Le conteneur tourne avec
 * `max_instances: 1` (vérifié le 2026-11-01, décision du coordinateur) : au
 * démarrage, aucune autre instance ne peut la conduire — elle est orpheline,
 * et un crash sur la même image ne doit pas bloquer l'opération.
 *
 * @returns le nombre de passages interrompus.
 */
@Injectable()
export class InterruptOrphanRuns {
  constructor(
    private readonly runs: PostDeployRunRepository,
    private readonly revision: DeployedRevision,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const current = this.revision.current();
    let interrupted = 0;
    for (const run of await this.runs.running()) {
      run.interrupt(
        `L'application (image ${run.revision}) s'est arrêtée avec le processus, avant la fin ; ` +
          `l'image ${current} a redémarré. Ce qui était écrit reste écrit : simulez de nouveau, puis appliquez.`,
        this.clock.now(),
      );
      await this.runs.save(run);
      interrupted += 1;
    }
    return interrupted;
  }
}
