import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { GuestAccountClaimedEvent } from "../../../account/domain/events/guest-account-claimed.event.js";
import { CreditWelcomeBonusCommand } from "../commands/credit-welcome-bonus.command.js";

/**
 * Une fiche invité vient de devenir un compte : devenir un compte, c'est
 * s'inscrire, et le bonus de bienvenue lui est dû (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * R1 et lot C). Le rattachement exige déjà la preuve de l'adresse, et l'écrit
 * en base dans la même requête.
 *
 * À côté de `CreditPointsOnGuestClaimed` plutôt qu'en lui : deux gestes, deux
 * abonnés — l'échec de l'un n'emporte pas l'autre. En mémoire, admis dans le
 * même bloc (`lint:durable-cross-block`) ; la passe de nuit rattrape.
 */
@EventsHandler(GuestAccountClaimedEvent)
export class CreditWelcomeBonusOnGuestClaimed implements IEventHandler<GuestAccountClaimedEvent> {
  constructor(
    private readonly commands: CommandBus,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: GuestAccountClaimedEvent): void {
    void this.work.track(this.run(event.userId), "credit-welcome-bonus-on-guest-claimed");
  }

  private async run(userId: string): Promise<void> {
    await this.commands.execute<CreditWelcomeBonusCommand, boolean>(
      new CreditWelcomeBonusCommand(userId),
    );
  }
}
