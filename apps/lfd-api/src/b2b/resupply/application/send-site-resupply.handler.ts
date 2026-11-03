import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyPlanKeyReader } from "../domain/site-resupply-plan-key.reader.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SendSiteResupplyCommand } from "./send-site-resupply.command.js";
import { ResupplyPlanGate } from "./resupply-plan-gate.js";
import { loadSiteResupply } from "./site-resupply-draft.js";

/**
 * **Envoie la demande en cours** (R1c) : `place()` sous la version que
 * le poste a vue — l'heure du réassort pour « pour demain », jamais pour
 * « au plus tôt » ; une demande vide ou d'une journée passée ne part pas. Le
 * prochain ajout de la visée ouvrira une nouvelle demande.
 *
 * Depuis le 2026-10-21 (R3a), « pour demain » s'admet au plan SOUS le
 * verrou de la journée (`ResupplyPlanGate`), dans l'unité de travail qui
 * écrit : l'arrêt du plan voit l'envoi, ou l'envoi voit l'arrêt.
 *
 * **Verrou, PUIS chargement** (audit du 2026-11-02, comme l'annulation) : la
 * clé de la journée (visée, journée — immuables) est lue d'abord, le verrou
 * pris sur elle, et la demande chargée ensuite, sous lui.
 *
 * **Un double clic ne fait pas d'erreur** (D5, 2026-11-02) : un second
 * « Envoyer » posé sur la MÊME version que l'envoi qui a réussi rend succès
 * sans rien écrire ({@link SiteResupply.isPlacementOf}). Une version plus
 * ancienne reste refusée (409) : le poste n'a pas vu ce qui est parti.
 */
@CommandHandler(SendSiteResupplyCommand)
export class SendSiteResupplyHandler implements ICommandHandler<SendSiteResupplyCommand, void> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly keys: SiteResupplyPlanKeyReader,
    private readonly cutoff: ResupplyCutoff,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly gate: ResupplyPlanGate,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SendSiteResupplyCommand): Promise<void> {
    const { siteId, resupplyId } = command;
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const key = await this.keys.keyOf(siteId, resupplyId);
      if (key === null) {
        throw new SiteResupplyNotFoundError(resupplyId);
      }
      const stopped = await this.gate.hold(key.target, key.serviceDay);
      const draft = await loadSiteResupply(this.resupplies, siteId, resupplyId);
      if (draft.isPlacementOf(command.seenVersion)) {
        return;
      }
      draft.assertSeen(command.seenVersion);
      const deadline = await this.cutoff.deadlineFor(draft.serviceDay);
      draft.place(trace, { deadline, planStopped: stopped });
      await this.resupplies.save(draft);
    });
  }
}
