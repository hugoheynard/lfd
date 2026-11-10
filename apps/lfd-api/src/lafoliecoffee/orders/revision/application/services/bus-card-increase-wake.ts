import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { CardIncreaseWake } from "../../domain/ports/card-increase-wake.js";
import { ApplyCardIncreaseCommand } from "../commands/apply-card-increase.command.js";

const APPLY_CARD_INCREASE = "orders.apply-card-increase";

/**
 * Le réveil de l'exécuteur des hausses (plan S2, §2.6) par le bus de
 * commandes — la figure de `BusCardRefundDispatch`. Appelé APRÈS validation
 * (`AfterCommit`, par le paiement ou « Relancer ») ; best effort, sans
 * relance : un exécuteur qui n'aboutit pas laisse le projet `ready`, et le
 * balayage le reprend. Ne lève pas, et n'attend pas l'exécuteur.
 */
@Injectable()
export class BusCardIncreaseWake extends CardIncreaseWake {
  constructor(
    private readonly work: BackgroundWork,
    private readonly commands: CommandBus,
  ) {
    super();
  }

  wake(proposalId: string): Promise<void> {
    void this.work.track(
      this.commands.execute<ApplyCardIncreaseCommand, void>(
        new ApplyCardIncreaseCommand(proposalId),
      ),
      APPLY_CARD_INCREASE,
    );
    return Promise.resolve();
  }
}
