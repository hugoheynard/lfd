import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SendSiteResupplyCommand } from "./send-site-resupply.command.js";
import { loadSiteResupply } from "./site-resupply-draft.js";

/**
 * **Envoie la demande en cours** (lot R1c) : `place()` sous la version que
 * le poste a vue, avec les règles de R1 — l'heure limite de sa journée pour
 * « pour demain » quand le réassort y est soumis, jamais pour « au plus
 * tôt » ; une demande vide ou d'une journée passée ne part pas. Le prochain
 * ajout de la visée ouvrira une nouvelle demande.
 */
@CommandHandler(SendSiteResupplyCommand)
export class SendSiteResupplyHandler implements ICommandHandler<SendSiteResupplyCommand, void> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly cutoff: ResupplyCutoff,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: SendSiteResupplyCommand): Promise<void> {
    const draft = await loadSiteResupply(this.resupplies, command.siteId, command.resupplyId);
    draft.assertSeen(command.seenVersion);
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    draft.place(trace, await this.cutoff.deadlineFor(draft.serviceDay));
    await this.resupplies.save(draft);
  }
}
