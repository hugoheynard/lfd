import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { CancelSiteResupplyCommand } from "./cancel-site-resupply.command.js";
import { ResupplyPlanGate } from "./resupply-plan-gate.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Annule un réassort.** Chargé sous le point de l'URL : celui d'un autre
 * point est introuvable. Sa réception est lue et remise à l'agrégat, qui
 * refuse d'annuler un réassort déjà réceptionné (lot R1d).
 *
 * Depuis le lot R3a (2026-10-21), sous le verrou de la journée
 * (`ResupplyPlanGate`) : un réassort « pour demain » figé dans un plan arrêté
 * ne s'annule plus, et l'arrêt ne peut pas se glisser entre la lecture et
 * l'écriture.
 */
@CommandHandler(CancelSiteResupplyCommand)
export class CancelSiteResupplyHandler implements ICommandHandler<CancelSiteResupplyCommand, void> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly receptions: ResupplyReceptions,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly gate: ResupplyPlanGate,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelSiteResupplyCommand): Promise<void> {
    const trace = await traceOf(this.staff, this.clock, command.staffUserId);
    await this.uow.run(async () => {
      const resupply = await this.resupplies.load(command.siteId, command.resupplyId);
      if (resupply === null) {
        throw new SiteResupplyNotFoundError(command.resupplyId);
      }
      const stopped = await this.gate.hold(resupply.target, resupply.serviceDay);
      const reception = await this.receptions.receptionOf(command.siteId, resupply.id);
      resupply.cancel(trace, reception, stopped);
      await this.resupplies.save(resupply);
    });
  }
}
