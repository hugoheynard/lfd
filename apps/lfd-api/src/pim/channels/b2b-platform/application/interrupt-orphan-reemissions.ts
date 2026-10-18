import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ReemissionJobRepository } from "../domain/ports/reemission-job.repository.js";

/** Au démarrage : clore les réémissions qu'aucun processus ne tient plus. */
export class InterruptOrphanReemissionsCommand {}

/**
 * **Une réémission « en cours » au démarrage est orpheline.**
 *
 * Elle tournait en mémoire, dans le processus qui vient de s'arrêter ; rien ne
 * la finira. La laisser « en cours » mentirait à l'écran pour toujours, et
 * bloquerait le prochain « tout » (un seul à la fois). Elle passe donc
 * `failed`, avec sa raison écrite.
 *
 * @returns le nombre de travaux clos.
 *
 * @sans-journal geste machine au démarrage ; la raison est écrite dans le travail.
 */
@CommandHandler(InterruptOrphanReemissionsCommand)
export class InterruptOrphanReemissionsHandler implements ICommandHandler<
  InterruptOrphanReemissionsCommand,
  number
> {
  constructor(
    private readonly jobs: ReemissionJobRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const orphans = await this.jobs.running();
    const now = this.clock.now();
    for (const job of orphans) {
      job.interrupt(now);
      await this.jobs.save(job);
    }
    return orphans.length;
  }
}
