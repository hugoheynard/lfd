import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CounterAccountCeilingSettingRepository } from "../../domain/ports/counter-account-ceiling-setting.repository.js";
import { CounterAccountCeilingSetting } from "../../domain/value-objects/counter-account-ceiling-setting.js";
import { SetCounterAccountCeilingCommand } from "./set-counter-account-ceiling.command.js";

/**
 * Pose le plafond des comptes du comptoir (§ 3.3). Une seule valeur, posée
 * entière : rien à relire avant d'écrire. La passation et l'estimation le
 * lisent au geste suivant.
 *
 * Pas de fait au journal : la trace est la ligne elle-même (instant et
 * auteur), comme le réglage d'annulation par le client.
 *
 * @throws {InvalidCounterAccountCeilingError} un montant négatif ou non entier.
 */
@CommandHandler(SetCounterAccountCeilingCommand)
export class SetCounterAccountCeilingHandler implements ICommandHandler<
  SetCounterAccountCeilingCommand,
  void
> {
  constructor(
    private readonly settings: CounterAccountCeilingSettingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetCounterAccountCeilingCommand): Promise<void> {
    await this.settings.put(
      CounterAccountCeilingSetting.pose(
        command.ceilingCents,
        this.clock.now(),
        command.staffUserId,
      ),
    );
  }
}
