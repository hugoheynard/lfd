import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { UserRegisteredEvent } from "../../../account/domain/events/user-registered.event.js";
import { CreditWelcomeBonusCommand } from "../commands/credit-welcome-bonus.command.js";

/**
 * Une personne vient de créer son compte : le bonus de bienvenue lui est dû
 * si son adresse est déjà prouvée (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * lot C). Une inscription dont l'adresse n'est pas encore prouvée ne reçoit
 * rien ici : la passe de nuit le lui écrira une fois la preuve faite.
 *
 * Abonné en mémoire, et c'est admis : `account` et `loyalty` sont du même bloc
 * (`lint:durable-cross-block`). Un redémarrage au mauvais moment ne perd
 * rien — la passe de nuit lit l'état.
 */
@EventsHandler(UserRegisteredEvent)
export class CreditWelcomeBonusOnRegistered implements IEventHandler<UserRegisteredEvent> {
  constructor(
    private readonly commands: CommandBus,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: UserRegisteredEvent): void {
    // **Suivi** : hors de la requête HTTP — sans cette inscription, personne
    // ne sait quand il a fini.
    void this.work.track(this.run(event.userId), "credit-welcome-bonus-on-registered");
  }

  private async run(userId: string): Promise<void> {
    await this.commands.execute<CreditWelcomeBonusCommand, boolean>(
      new CreditWelcomeBonusCommand(userId),
    );
  }
}
