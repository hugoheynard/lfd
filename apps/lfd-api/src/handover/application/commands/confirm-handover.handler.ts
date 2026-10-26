import type { OrderHandoverView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverTokenNotFoundError } from "../../domain/errors/handover-errors.js";
import { HandoverAttestation } from "../services/handover-attestation.service.js";
import { HandoverCounterView } from "../services/handover-counter-view.js";
import { ConfirmHandoverCommand } from "./confirm-handover.command.js";

/**
 * **Le retrait scanné** : résoudre le jeton, puis attester.
 *
 * 🔴 Ce handler vivait dans `b2b/orders/application/commands/` jusqu'au
 * 2026-09-07, et il écrivait `orders.handed_over_*` en direct. C'est au labo
 * qu'on retire : celui qui voit le client partir avec son sac est le seul à
 * pouvoir l'attester, et il écrit désormais dans SES tables. Le commerce
 * l'apprend par `OrderHandedOverEvent` et en tire `fulfilled`.
 *
 * Il ne fait plus qu'**une** chose de son côté — trouver la commande derrière le
 * secret. Le reste est le geste commun, dans `HandoverAttestation`, et l'accusé
 * relu par `HandoverCounterView` : il dit aussi les envois qui restent.
 */
@CommandHandler(ConfirmHandoverCommand)
export class ConfirmHandoverHandler implements ICommandHandler<
  ConfirmHandoverCommand,
  OrderHandoverView
> {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly attestation: HandoverAttestation,
    private readonly counter: HandoverCounterView,
  ) {}

  async execute(command: ConfirmHandoverCommand): Promise<OrderHandoverView> {
    const subject = await this.subjects.byToken(command.token);
    if (subject === null) {
      throw new HandoverTokenNotFoundError();
    }
    // Le jeton résout la COMMANDE ; les envois sont ceux cochés, sinon celui
    // que l'écran montrait (plan E7 reliquat, L4c).
    const ranks = await this.counter.ranksToHandOver(subject, command.ranks);
    await this.attestation.attest(subject, ranks, command.staffUserId, "scan");
    return this.counter.viewOf(subject, ranks[0] ?? null);
  }
}
