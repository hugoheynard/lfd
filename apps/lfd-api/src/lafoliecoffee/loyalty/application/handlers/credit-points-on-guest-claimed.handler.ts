import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { GuestAccountClaimedEvent } from "../../../account/domain/events/guest-account-claimed.event.js";
import { CreditClaimedGuestPointsCommand } from "../commands/credit-claimed-guest-points.command.js";

/**
 * Une fiche invité vient de devenir un compte : ses commandes définitives
 * rapportent leurs points **maintenant**, plutôt qu'à la nuit (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * §7 — « vos points sont là »).
 *
 * Abonné en mémoire, et c'est admis : `account` et `loyalty` sont du même bloc
 * (`lint:durable-cross-block`). Un redémarrage au mauvais moment ne perd
 * rien — le rattrapage de nuit lit l'état, et le `sub` posé suffit à rendre
 * ces commandes créditables.
 */
@EventsHandler(GuestAccountClaimedEvent)
export class CreditPointsOnGuestClaimed implements IEventHandler<GuestAccountClaimedEvent> {
  constructor(
    private readonly commands: CommandBus,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: GuestAccountClaimedEvent): void {
    // **Suivi** : hors de la requête HTTP — sans cette inscription, personne
    // ne sait quand il a fini.
    void this.work.track(this.run(event), "credit-points-on-guest-claimed");
  }

  private async run(event: GuestAccountClaimedEvent): Promise<void> {
    await this.commands.execute<CreditClaimedGuestPointsCommand, number>(
      new CreditClaimedGuestPointsCommand(event.userId),
    );
  }
}
