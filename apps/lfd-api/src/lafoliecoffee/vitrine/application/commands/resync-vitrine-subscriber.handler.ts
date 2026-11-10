import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineFingerprintStore } from "../../domain/ports/vitrine-fingerprint.store.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { ResyncVitrineSubscriberCommand } from "./resync-vitrine-subscriber.command.js";

/**
 * **Tout renvoyer** (W7, B3) : l'échec est levé et les empreintes émises
 * oubliées — le prochain balayage (cinq minutes au plus) annonce TOUT comme
 * changé, en une notification. C'est la reprise après une panne de l'agence.
 *
 * @sans-journal un geste de reprise, lisible au journal des envois.
 */
@CommandHandler(ResyncVitrineSubscriberCommand)
export class ResyncVitrineSubscriberHandler implements ICommandHandler<ResyncVitrineSubscriberCommand> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly prints: VitrineFingerprintStore,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ResyncVitrineSubscriberCommand): Promise<void> {
    await this.uow.run(async () => {
      const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
      subscriber.resynchronize(this.clock.now());
      await this.prints.forget(subscriber.id);
      await this.subscribers.save(subscriber);
    });
  }
}
