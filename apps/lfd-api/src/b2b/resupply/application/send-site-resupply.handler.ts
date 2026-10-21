import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SendSiteResupplyCommand } from "./send-site-resupply.command.js";
import { ResupplyPlanGate } from "./resupply-plan-gate.js";
import { loadSiteResupply } from "./site-resupply-draft.js";

/**
 * **Envoie la demande en cours** (lot R1c) : `place()` sous la version que
 * le poste a vue — l'heure du réassort pour « pour demain », jamais pour
 * « au plus tôt » ; une demande vide ou d'une journée passée ne part pas. Le
 * prochain ajout de la visée ouvrira une nouvelle demande.
 *
 * Depuis le lot R3a (2026-10-21), « pour demain » s'admet au plan SOUS le
 * verrou de la journée (`ResupplyPlanGate`), dans l'unité de travail qui
 * écrit : l'arrêt du plan voit l'envoi, ou l'envoi voit l'arrêt.
 */
@CommandHandler(SendSiteResupplyCommand)
export class SendSiteResupplyHandler implements ICommandHandler<SendSiteResupplyCommand, void> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly cutoff: ResupplyCutoff,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly gate: ResupplyPlanGate,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SendSiteResupplyCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const draft = await loadSiteResupply(this.resupplies, command.siteId, command.resupplyId);
      draft.assertSeen(command.seenVersion);
      const deadline = await this.cutoff.deadlineFor(draft.serviceDay);
      const stopped = await this.gate.hold(draft.target, draft.serviceDay);
      draft.place(trace, deadline, stopped);
      await this.resupplies.save(draft);
    });
  }
}
