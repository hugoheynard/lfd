import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyParentReader } from "../../../account/domain/ports/company-parent.reader.js";
import { SubAccountNoticeSwitchWriter } from "../../../account/domain/ports/sub-account-notice-switch.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ensurePrincipal } from "../ensure-principal.js";
import { SetSubAccountNoticesEnabledCommand } from "./set-sub-account-notices-enabled.command.js";

/**
 * Bascule l'interrupteur des avis d'un principal
 * (`plan-notifications-sous-comptes.md`, « Interrupteur bâti »). Réactiver ne
 * rattrape rien : un geste fait pendant la coupure n'a laissé ni mail ni ligne
 * au journal d'envoi, et ne sera pas envoyé plus tard.
 *
 * @throws {NoticePrincipalNotFoundError} la société n'existe pas.
 * @throws {NotAPrincipalError} la société est un sous-compte.
 */
@CommandHandler(SetSubAccountNoticesEnabledCommand)
export class SetSubAccountNoticesEnabledHandler implements ICommandHandler<
  SetSubAccountNoticesEnabledCommand,
  void
> {
  constructor(
    private readonly parents: CompanyParentReader,
    private readonly switches: SubAccountNoticeSwitchWriter,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetSubAccountNoticesEnabledCommand): Promise<void> {
    await ensurePrincipal(this.parents, command.principalId);
    await this.switches.set(
      command.principalId,
      command.enabled,
      command.staffId,
      this.clock.now(),
    );
  }
}
